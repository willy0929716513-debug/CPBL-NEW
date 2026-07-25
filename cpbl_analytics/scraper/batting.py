"""打者「全記錄查詢」scraper：抓取球員完整季度打擊數據。

對應官網 config.URLS["record_all"]，打擊分頁（?type=batting 之類的參數，
實際查詢參數請依官網當下設計調整，見 fetch_batting_stats 的 params）。
"""
from __future__ import annotations

from dataclasses import dataclass

from cpbl_analytics.config import URLS
from cpbl_analytics.scraper.http import ParsingError, get_html
from cpbl_analytics.scraper.parsing_utils import ColumnSpec, parse_table, to_float, to_int

TABLE_SELECTOR = "table.RecordTable, table.record_table, table"

COLUMNS = [
    ColumnSpec(("排名",), "rank", required=False),
    ColumnSpec(("球員", "選手", "姓名"), "player_name"),
    ColumnSpec(("球隊", "隊伍"), "team_name"),
    ColumnSpec(("出賽數", "出賽"), "games"),
    ColumnSpec(("打席", "PA"), "plate_appearances", required=False),
    ColumnSpec(("打數", "AB"), "at_bats"),
    ColumnSpec(("得分", "R"), "runs"),
    ColumnSpec(("安打", "H"), "hits"),
    ColumnSpec(("二壘打", "2B"), "doubles"),
    ColumnSpec(("三壘打", "3B"), "triples"),
    ColumnSpec(("全壘打", "HR"), "home_runs"),
    ColumnSpec(("打點", "RBI"), "rbi"),
    ColumnSpec(("盜壘", "SB"), "stolen_bases", required=False),
    ColumnSpec(("盜壘刺", "CS"), "caught_stealing", required=False),
    ColumnSpec(("犧短", "犧牲短打", "SH"), "sac_bunts", required=False),
    ColumnSpec(("犧飛", "犧牲高飛", "SF"), "sac_flies", required=False),
    ColumnSpec(("四壞球", "四壞", "BB"), "walks", required=False),
    ColumnSpec(("故意四壞", "敬遠", "IBB"), "intentional_walks", required=False),
    ColumnSpec(("死球", "觸身球", "HBP"), "hit_by_pitch", required=False),
    ColumnSpec(("三振", "SO"), "strikeouts", required=False),
    ColumnSpec(("雙殺打", "GDP"), "double_plays", required=False),
    ColumnSpec(("打擊率", "AVG"), "avg"),
    ColumnSpec(("上壘率", "OBP"), "obp", required=False),
    ColumnSpec(("長打率", "SLG"), "slg", required=False),
    ColumnSpec(("OPS",), "ops", required=False),
]


@dataclass
class BattingStat:
    player_name: str
    team_name: str
    games: int
    at_bats: int
    runs: int
    hits: int
    doubles: int
    triples: int
    home_runs: int
    rbi: int
    stolen_bases: int
    caught_stealing: int
    sac_bunts: int
    sac_flies: int
    walks: int
    intentional_walks: int
    hit_by_pitch: int
    strikeouts: int
    double_plays: int
    avg: float
    obp: float | None
    slg: float | None
    ops: float | None
    plate_appearances: int | None = None
    rank: int | None = None


def fetch_batting_stats(*, html: str | None = None, year: int | None = None) -> list[BattingStat]:
    if html is None:
        params = {"year": year} if year else None
        html = get_html(URLS["record_all"], params=params)

    rows = parse_table(html, table_selector=TABLE_SELECTOR, columns=COLUMNS)

    stats: list[BattingStat] = []
    for row in rows:
        def gi(field: str) -> int:
            return to_int(row.get(field, "0"), field=field)

        def gf(field: str) -> float:
            return to_float(row.get(field, "0"), field=field)

        stats.append(
            BattingStat(
                player_name=row["player_name"],
                team_name=row["team_name"],
                games=gi("games"),
                at_bats=gi("at_bats"),
                runs=gi("runs"),
                hits=gi("hits"),
                doubles=gi("doubles"),
                triples=gi("triples"),
                home_runs=gi("home_runs"),
                rbi=gi("rbi"),
                stolen_bases=gi("stolen_bases"),
                caught_stealing=gi("caught_stealing"),
                sac_bunts=gi("sac_bunts"),
                sac_flies=gi("sac_flies"),
                walks=gi("walks"),
                intentional_walks=gi("intentional_walks"),
                hit_by_pitch=gi("hit_by_pitch"),
                strikeouts=gi("strikeouts"),
                double_plays=gi("double_plays"),
                avg=gf("avg"),
                obp=gf("obp") if row.get("obp") else None,
                slg=gf("slg") if row.get("slg") else None,
                ops=gf("ops") if row.get("ops") else None,
                plate_appearances=gi("plate_appearances") if row.get("plate_appearances") else None,
                rank=gi("rank") if row.get("rank") else None,
            )
        )

    if not stats:
        raise ParsingError("解析出的打者資料為空。")

    return stats
