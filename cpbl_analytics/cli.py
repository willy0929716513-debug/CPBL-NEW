"""命令列工具：實際對官網跑一次完整爬蟲 + 驗證 + 寫入資料庫。

使用方式：
    python -m cpbl_analytics.cli scrape --year 2026

注意：這支程式需要能連上 https://www.cpbl.com.tw 的網路環境才能運作。
若在沒有對外網路的沙盒/CI 環境執行，會直接拿到連線錯誤，這是預期行為，
不代表程式邏輯有問題（可參考 README「已知限制」章節）。
"""
from __future__ import annotations

import argparse
import sys

from cpbl_analytics import storage
from cpbl_analytics.scraper.batting import fetch_batting_stats
from cpbl_analytics.scraper.http import FetchError, ParsingError
from cpbl_analytics.scraper.pitching import fetch_pitching_stats
from cpbl_analytics.scraper.schedule import fetch_schedule
from cpbl_analytics.scraper.standings import fetch_standings
from cpbl_analytics.validation import (
    validate_batting_stats,
    validate_pitching_stats,
    validate_schedule,
    validate_standings,
)


def _print_report(dataset: str, report) -> None:
    status = "✅ 全部通過" if report.all_passed else "❌ 有檢查未通過"
    print(f"\n[{dataset}] 驗證結果：{status}")
    for check in report.checks:
        mark = "✅" if check.passed else ("🛑" if check.severity == "error" else "⚠️")
        print(f"  {mark} {check.name}: {check.message}")
        for item in check.offending_items[:5]:
            print(f"       - {item}")


def cmd_scrape(args: argparse.Namespace) -> int:
    storage.init_db()
    exit_code = 0

    try:
        print("正在抓取球隊戰績...")
        standings = fetch_standings()
        report = validate_standings(standings)
        storage.save_standings(standings, year=args.year)
        storage.save_scrape_run(dataset="standings", report=report, row_count=len(standings), year=args.year)
        _print_report("球隊戰績", report)
        if not report.all_passed:
            exit_code = 1
    except (FetchError, ParsingError) as exc:
        print(f"🛑 球隊戰績抓取失敗：{exc}")
        exit_code = 1

    try:
        print("\n正在抓取打者數據...")
        batting = fetch_batting_stats(year=args.year)
        report = validate_batting_stats(batting)
        storage.save_batting(batting, year=args.year)
        storage.save_scrape_run(dataset="batting", report=report, row_count=len(batting), year=args.year)
        _print_report("打者數據", report)
        if not report.all_passed:
            exit_code = 1
    except (FetchError, ParsingError) as exc:
        print(f"🛑 打者數據抓取失敗：{exc}")
        exit_code = 1

    try:
        print("\n正在抓取投手數據...")
        pitching = fetch_pitching_stats(year=args.year)
        report = validate_pitching_stats(pitching)
        storage.save_pitching(pitching, year=args.year)
        storage.save_scrape_run(dataset="pitching", report=report, row_count=len(pitching), year=args.year)
        _print_report("投手數據", report)
        if not report.all_passed:
            exit_code = 1
    except (FetchError, ParsingError) as exc:
        print(f"🛑 投手數據抓取失敗：{exc}")
        exit_code = 1

    try:
        print("\n正在抓取賽程與戰報...")
        games = fetch_schedule()
        report = validate_schedule(games)
        storage.save_schedule(games)
        storage.save_scrape_run(dataset="schedule", report=report, row_count=len(games), year=args.year)
        _print_report("賽程與戰報", report)
        if not report.all_passed:
            exit_code = 1
    except (FetchError, ParsingError) as exc:
        print(f"🛑 賽程抓取失敗：{exc}")
        exit_code = 1

    return exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cpbl_analytics", description="CPBL 數據爬蟲與驗證 CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    scrape_parser = sub.add_parser("scrape", help="抓取球隊戰績、打者、投手數據並寫入資料庫")
    scrape_parser.add_argument("--year", type=int, default=None, help="指定球季年度（預設為官網當前顯示的球季）")
    scrape_parser.set_defaults(func=cmd_scrape)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
