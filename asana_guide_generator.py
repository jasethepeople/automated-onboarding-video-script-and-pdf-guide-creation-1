#!/usr/bin/env python3
"""Capture an annotated Asana onboarding journey and build a PDF user guide.

This runner is intentionally conservative. It stores an authenticated browser session
locally, uses a dedicated test workspace, and does not send invitations unless the
operator explicitly supplies --allow-external-invites.

Example:
  python asana_guide_generator.py --record-auth --headed
  python asana_guide_generator.py --headed

The automation is config-driven so UI labels and selectors can be updated in
workflow.json without editing Python code.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import textwrap
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from playwright.async_api import Browser, BrowserContext, Locator, Page, async_playwright
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent
DEFAULT_WORKFLOW = ROOT / "workflow.json"
DEFAULT_OUTPUT = ROOT / "output"
DEFAULT_AUTH = ROOT / ".asana_auth.json"
LOG = logging.getLogger("asana-guide")


class WorkflowError(RuntimeError):
    """Raised when a configured interaction cannot be completed safely."""


@dataclass
class Capture:
    """One annotated screen that will become one PDF guide page."""

    index: int
    title: str
    instruction: str
    image_path: Path


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WorkflowError(f"Workflow file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise WorkflowError(f"Invalid JSON in {path}: {exc}") from exc


def substitute(value: Any, variables: dict[str, str]) -> Any:
    """Recursively replace {{VARIABLE}} tokens in JSON-derived data."""
    if isinstance(value, str):
        return re.sub(r"\{\{([A-Z0-9_]+)\}\}", lambda m: variables.get(m.group(1), m.group(0)), value)
    if isinstance(value, list):
        return [substitute(item, variables) for item in value]
    if isinstance(value, dict):
        return {key: substitute(item, variables) for key, item in value.items()}
    return value


def require_value(name: str, value: str | None) -> str:
    if not value or value.startswith("{{"):
        raise WorkflowError(f"Set {name} in workflow.json or pass it using the corresponding command-line option.")
    return value


def find_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def wrapped_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    line = ""
    for word in words:
        proposal = word if not line else f"{line} {word}"
        if draw.textbbox((0, 0), proposal, font=font)[2] <= max_width:
            line = proposal
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines or [""]


def draw_arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: str, width: int = 7) -> None:
    """Draw an arrow with a clear triangular head."""
    draw.line([start, end], fill=color, width=width)
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    head = 22
    base_x, base_y = end[0] - ux * head, end[1] - uy * head
    points = [
        end,
        (int(base_x + px * head * 0.55), int(base_y + py * head * 0.55)),
        (int(base_x - px * head * 0.55), int(base_y - py * head * 0.55)),
    ]
    draw.polygon(points, fill=color)


def annotate_screenshot(source: Path, destination: Path, annotations: list[dict[str, Any]]) -> None:
    """Overlay high-contrast arrows, target rings, and concise label cards."""
    with Image.open(source).convert("RGBA") as image:
        overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        width, height = image.size
        body = find_font(max(22, width // 58))
        heading = find_font(max(26, width // 48), bold=True)
        accent = "#FF5A5F"
        dark = (20, 28, 43, 238)

        for annotation in annotations:
            box = annotation.get("box")
            if not box:
                continue
            x, y, box_width, box_height = [int(number) for number in box]
            target_x = x + box_width // 2
            target_y = y + box_height // 2
            padding = max(8, width // 200)
            draw.rounded_rectangle(
                (x - padding, y - padding, x + box_width + padding, y + box_height + padding),
                radius=10,
                outline=accent,
                width=max(3, width // 480),
                fill=(255, 90, 95, 35),
            )

            label = str(annotation.get("label", ""))
            if not label:
                continue
            max_card_width = int(width * 0.30)
            lines = wrapped_lines(draw, label, body, max_card_width - 36)
            line_height = int(draw.textbbox((0, 0), "Ag", font=body)[3] * 1.25)
            label_font = heading if len(lines) == 1 else body
            text_width = max(draw.textbbox((0, 0), line, font=label_font)[2] for line in lines)
            card_width = min(max_card_width, text_width + 36)
            card_height = 30 + line_height * len(lines)
            place_left = target_x > width * 0.55
            card_x = max(20, x - card_width - 65) if place_left else min(width - card_width - 20, x + box_width + 65)
            card_y = min(max(20, target_y - card_height // 2), height - card_height - 20)
            card_rect = (int(card_x), int(card_y), int(card_x + card_width), int(card_y + card_height))
            draw.rounded_rectangle(card_rect, radius=14, fill=dark, outline=accent, width=3)
            draw.text((card_x + 18, card_y + 14), lines[0], font=label_font, fill="white")
            if len(lines) > 1:
                for line_no, line in enumerate(lines):
                    draw.text((card_x + 18, card_y + 14 + line_no * line_height), line, font=body, fill="white")
            arrow_start = (int(card_x + card_width), int(card_y + card_height // 2)) if place_left else (int(card_x), int(card_y + card_height // 2))
            draw_arrow(draw, arrow_start, (target_x, target_y), accent)

        finished = Image.alpha_composite(image, overlay).convert("RGB")
        finished.save(destination, quality=95)


async def first_visible_locator(page: Page, selectors: list[str], timeout_ms: int) -> Locator:
    """Return the first visible selector from an ordered fallback list."""
    failures: list[str] = []
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            await locator.wait_for(state="visible", timeout=timeout_ms)
            return locator
        except Exception:
            failures.append(selector)
    joined = "\n  - ".join(failures)
    raise WorkflowError(f"None of the expected UI elements became visible:\n  - {joined}")


async def box_for_annotation(page: Page, selector_list: list[str], timeout_ms: int) -> list[float] | None:
    try:
        locator = await first_visible_locator(page, selector_list, timeout_ms)
        return await locator.bounding_box()
    except WorkflowError:
        return None


async def ensure_login(context: BrowserContext, page: Page, config: dict[str, Any], record_auth: bool, headed: bool) -> None:
    """Either capture a local authenticated session or verify the saved session works."""
    login_url = config["login_url"]
    home_url = config["start_url"]
    logged_in_selectors = config["logged_in_selectors"]
    timeout = int(config.get("timeout_ms", 12000))

    await page.goto(login_url, wait_until="domcontentloaded")
    await page.wait_for_timeout(900)
    try:
        await first_visible_locator(page, logged_in_selectors, 2500)
        LOG.info("An active signed-in session is already available.")
    except WorkflowError:
        if not record_auth:
            raise WorkflowError(
                "No valid saved Asana session was found. Run once with --record-auth --headed, sign in manually, "
                "then return to the terminal and press Enter."
            )
        if not headed:
            raise WorkflowError("Authentication capture requires --headed so you can complete login and any MFA manually.")
        print("\nSign in to Asana in the opened browser window. Complete any MFA yourself.\n"
              "When the Home page or workspace is visible, return here and press Enter.\n")
        await asyncio.get_running_loop().run_in_executor(None, input)
        await page.goto(home_url, wait_until="domcontentloaded")
        await page.wait_for_timeout(1200)
        await first_visible_locator(page, logged_in_selectors, timeout)

    auth_path = Path(config["auth_state_path"])
    auth_path.parent.mkdir(parents=True, exist_ok=True)
    await context.storage_state(path=str(auth_path))
    LOG.info("Saved local browser session to %s", auth_path)


async def run_workflow(page: Page, config: dict[str, Any], output_dir: Path, allow_external_invites: bool) -> list[Capture]:
    captures: list[Capture] = []
    timeout = int(config.get("timeout_ms", 12000))
    screenshot_dir = output_dir / "screenshots"
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    for step_number, step in enumerate(config["steps"], start=1):
        action = step["action"]
        LOG.info("Step %02d: %s", step_number, step.get("name", action))

        if action == "goto":
            await page.goto(step["url"], wait_until=step.get("wait_until", "domcontentloaded"))
            await page.wait_for_timeout(int(step.get("settle_ms", 1000)))
        elif action == "wait":
            await page.wait_for_timeout(int(step.get("ms", 800)))
        elif action == "wait_for":
            await first_visible_locator(page, step["selectors"], int(step.get("timeout_ms", timeout)))
        elif action == "click":
            locator = await first_visible_locator(page, step["selectors"], int(step.get("timeout_ms", timeout)))
            await locator.click()
            await page.wait_for_timeout(int(step.get("settle_ms", 700)))
        elif action == "fill":
            locator = await first_visible_locator(page, step["selectors"], int(step.get("timeout_ms", timeout)))
            await locator.fill(step["text"])
            await page.wait_for_timeout(int(step.get("settle_ms", 350)))
        elif action == "press":
            locator = await first_visible_locator(page, step["selectors"], int(step.get("timeout_ms", timeout)))
            await locator.press(step["key"])
            await page.wait_for_timeout(int(step.get("settle_ms", 500)))
        elif action == "capture":
            annotations: list[dict[str, Any]] = []
            for annotation in step.get("annotations", []):
                box = await box_for_annotation(page, annotation["selectors"], int(annotation.get("timeout_ms", 1800)))
                if box:
                    annotations.append({"box": box, "label": annotation["label"]})
                else:
                    LOG.warning("Annotation target not found; capturing without it: %s", annotation["label"])
            raw_path = screenshot_dir / f"{len(captures) + 1:02d}_{step['slug']}_raw.png"
            annotated_path = screenshot_dir / f"{len(captures) + 1:02d}_{step['slug']}.png"
            await page.screenshot(path=str(raw_path), full_page=bool(step.get("full_page", False)))
            annotate_screenshot(raw_path, annotated_path, annotations)
            raw_path.unlink(missing_ok=True)
            captures.append(Capture(len(captures) + 1, step["title"], step["instruction"], annotated_path))
        elif action == "invite":
            if not allow_external_invites:
                LOG.warning("Skipping invitation submission because --allow-external-invites was not supplied.")
                continue
            email = require_value("COLLABORATOR_EMAIL", config["variables"].get("COLLABORATOR_EMAIL"))
            email_field = await first_visible_locator(page, step["email_selectors"], timeout)
            await email_field.fill(email)
            await page.wait_for_timeout(600)
            submit = await first_visible_locator(page, step["submit_selectors"], timeout)
            await submit.click()
            await page.wait_for_timeout(int(step.get("settle_ms", 900)))
        else:
            raise WorkflowError(f"Unsupported action in workflow.json: {action}")

    return captures


def pdf_wrap(text: str, width_chars: int = 110) -> list[str]:
    return textwrap.wrap(text, width=width_chars, break_long_words=False) or [""]


def build_pdf(captures: list[Capture], output_path: Path, guide_title: str) -> None:
    """Create a polished landscape-A4 guide with one instructional screenshot per page."""
    page_width, page_height = landscape(A4)
    pdf = canvas.Canvas(str(output_path), pagesize=(page_width, page_height))
    pdf.setTitle(guide_title)
    pdf.setAuthor("Manus AI")

    for capture in captures:
        margin = 30
        title_y = page_height - 36
        pdf.setFillColorRGB(0.11, 0.16, 0.26)
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(margin, title_y, f"{capture.index:02d}. {capture.title}")
        pdf.setFillColorRGB(0.24, 0.28, 0.35)
        pdf.setFont("Helvetica", 10.5)
        instruction_y = title_y - 18
        for line in pdf_wrap(capture.instruction):
            pdf.drawString(margin, instruction_y, line)
            instruction_y -= 13

        with Image.open(capture.image_path) as image:
            image_width, image_height = image.size
        usable_width = page_width - 2 * margin
        image_top = instruction_y - 9
        usable_height = image_top - margin - 12
        scale = min(usable_width / image_width, usable_height / image_height)
        draw_width, draw_height = image_width * scale, image_height * scale
        draw_x = (page_width - draw_width) / 2
        draw_y = margin + 12
        pdf.drawImage(ImageReader(str(capture.image_path)), draw_x, draw_y, draw_width, draw_height, preserveAspectRatio=True, mask="auto")
        pdf.setFillColorRGB(0.45, 0.48, 0.54)
        pdf.setFont("Helvetica", 8)
        pdf.drawRightString(page_width - margin, 16, f"{guide_title}  |  Generated {datetime.now().strftime('%Y-%m-%d')}")
        pdf.showPage()

    pdf.save()


async def main_async(args: argparse.Namespace) -> None:
    workflow_path = Path(args.workflow).resolve()
    raw_config = load_json(workflow_path)
    raw_config["auth_state_path"] = args.auth_state or raw_config.get("auth_state_path", str(DEFAULT_AUTH))
    raw_config["output_dir"] = args.output or raw_config.get("output_dir", str(DEFAULT_OUTPUT))
    cli_variables = {
        "PROJECT_NAME": args.project_name,
        "ASSIGNEE_NAME": args.assignee,
        "DUE_DATE": args.due_date,
        "COLLABORATOR_EMAIL": args.collaborator,
    }
    variables = {**raw_config.get("variables", {}), **{key: value for key, value in cli_variables.items() if value}}
    config = substitute(raw_config, variables)
    output_dir = Path(config["output_dir"]).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as playwright:
        auth_file = Path(config["auth_state_path"]).expanduser()
        context_options: dict[str, Any] = {
            "viewport": {"width": int(config.get("viewport_width", 1920)), "height": int(config.get("viewport_height", 1080))},
            "device_scale_factor": 1,
        }
        if auth_file.exists():
            context_options["storage_state"] = str(auth_file)
        browser: Browser = await playwright.chromium.launch(headless=not args.headed, slow_mo=args.slow_mo)
        context = await browser.new_context(**context_options)
        page = await context.new_page()
        page.set_default_timeout(int(config.get("timeout_ms", 12000)))
        try:
            await ensure_login(context, page, config, args.record_auth, args.headed)
            if args.record_auth and args.auth_only:
                return
            captures = await run_workflow(page, config, output_dir, args.allow_external_invites)
            if not captures:
                raise WorkflowError("The workflow completed without producing screenshots.")
            if not args.no_pdf:
                pdf_path = output_dir / config.get("pdf_filename", "asana_first_project_user_guide.pdf")
                build_pdf(captures, pdf_path, config.get("guide_title", "Asana: Create Your First Project"))
                LOG.info("PDF guide created: %s", pdf_path)
            LOG.info("Annotated screenshots created: %s", output_dir / "screenshots")
        finally:
            await context.close()
            await browser.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture an annotated Asana onboarding journey and compile a PDF guide.")
    parser.add_argument("--workflow", default=str(DEFAULT_WORKFLOW), help="Path to the JSON workflow configuration.")
    parser.add_argument("--output", help="Directory for screenshots and the generated PDF.")
    parser.add_argument("--auth-state", help="Path to the locally stored browser-session file.")
    parser.add_argument("--record-auth", action="store_true", help="Open a headed browser and save a local authenticated session after manual sign-in.")
    parser.add_argument("--auth-only", action="store_true", help="With --record-auth, save the session then exit without modifying a test workspace.")
    parser.add_argument("--headed", action="store_true", help="Show the browser while the guide is captured.")
    parser.add_argument("--slow-mo", type=int, default=0, help="Delay each browser operation by this many milliseconds for debugging.")
    parser.add_argument("--allow-external-invites", action="store_true", help="Allow the configured collaboration invitation to be submitted. Off by default.")
    parser.add_argument("--no-pdf", action="store_true", help="Capture annotated screenshots but do not compile a PDF.")
    parser.add_argument("--project-name", help="Override PROJECT_NAME from workflow.json.")
    parser.add_argument("--assignee", help="Override ASSIGNEE_NAME from workflow.json.")
    parser.add_argument("--due-date", help="Override DUE_DATE from workflow.json.")
    parser.add_argument("--collaborator", help="Override COLLABORATOR_EMAIL from workflow.json.")
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
    try:
        asyncio.run(main_async(parse_args()))
        return 0
    except WorkflowError as exc:
        LOG.error("%s", exc)
        return 2
    except KeyboardInterrupt:
        LOG.error("Run cancelled by user.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
