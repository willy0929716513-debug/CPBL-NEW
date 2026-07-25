"""共用的 HTML 表格解析工具。

核心設計原則（這是整支程式「確保抓到的資料是對的」最重要的一道防線）：

    絕對不要用「第幾欄」去抓資料，永遠用「表頭文字」去對應欄位。

官網改版時最常見的狀況是「欄位順序調換」或「多塞一欄」，如果用位置索引
（row[3], row[4]...）去讀資料，改版後程式不會出錯，但抓到的數字會全部
錯位——這是最危險的錯誤：安靜地產生錯誤資料。

用表頭文字比對的做法，遇到官網改版、表頭消失或改名時，會直接丟出
ParsingError，逼你在第一時間發現「資料源頭已經跟程式預期的不一樣了」，
而不是讓錯的數字流到分析報表裡。
"""
from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup
from bs4.element import Tag

from cpbl_analytics.scraper.http import ParsingError


def _clean_text(text: str) -> str:
    return text.replace("\xa0", " ").replace("　", " ").strip()


@dataclass(frozen=True)
class ColumnSpec:
    """一個欄位的定義。

    header_aliases: 這個欄位在官網上可能出現的表頭文字（列出多個別名，
        因為同一份資料在不同球季/不同頁面上，官網用的字眼不見得完全一樣，
        例如「打擊率」vs「AVG」）。
    field: 對應到內部資料模型要用的欄位名稱。
    required: 若為 True 但找不到任何別名對應的表頭，直接視為解析失敗。
    """

    header_aliases: tuple[str, ...]
    field: str
    required: bool = True


def parse_table(
    html: str,
    *,
    table_selector: str,
    columns: list[ColumnSpec],
    header_row_selector: str = "thead tr, tr:has(th)",
) -> list[dict[str, str]]:
    """把一個 HTML 表格解析成 list[dict]，key 是 ColumnSpec.field。

    Raises:
        ParsingError: 找不到表格、找不到必要表頭、或表格沒有任何資料列。
    """
    soup = BeautifulSoup(html, "lxml")
    table = soup.select_one(table_selector)
    if table is None:
        raise ParsingError(
            f"找不到表格（selector={table_selector!r}）。"
            "官網結構可能已變更，請更新 table_selector。"
        )

    header_cells = _find_header_cells(table, header_row_selector)
    if not header_cells:
        raise ParsingError("找不到表頭列（<th>），無法確認欄位對應關係。")

    header_texts = [_clean_text(c.get_text()) for c in header_cells]

    # 建立「表頭文字 -> 欄位索引」的對應
    index_of_field: dict[str, int] = {}
    for spec in columns:
        found_index = None
        for alias in spec.header_aliases:
            for idx, text in enumerate(header_texts):
                if text == alias or alias in text:
                    found_index = idx
                    break
            if found_index is not None:
                break
        if found_index is None:
            if spec.required:
                raise ParsingError(
                    f"表格缺少必要欄位「{spec.field}」"
                    f"（預期表頭別名：{spec.header_aliases}，"
                    f"實際表頭：{header_texts}）。官網可能已改版。"
                )
            continue
        index_of_field[spec.field] = found_index

    body_rows = _find_body_rows(table, header_row_selector)
    if not body_rows:
        raise ParsingError("表格沒有任何資料列（可能是空賽季、或版面改變）。")

    records: list[dict[str, str]] = []
    for row in body_rows:
        cells = row.find_all(["td", "th"])
        if not cells:
            continue
        cell_texts = [_clean_text(c.get_text()) for c in cells]
        if len(cell_texts) < len(header_texts):
            # 常見於合併儲存格的分隔列、廣告列等雜訊列，略過。
            continue
        record = {
            field: cell_texts[idx] if idx < len(cell_texts) else ""
            for field, idx in index_of_field.items()
        }
        records.append(record)

    return records


def _find_header_cells(table: Tag, header_row_selector: str) -> list[Tag]:
    thead = table.find("thead")
    if thead is not None:
        ths = thead.find_all("th")
        if ths:
            return ths
    # fallback: 第一列如果全部是 th，也當表頭
    first_row = table.find("tr")
    if first_row is not None:
        ths = first_row.find_all("th")
        if ths:
            return ths
    return []


def _find_body_rows(table: Tag, header_row_selector: str) -> list[Tag]:
    tbody = table.find("tbody")
    rows_container = tbody if tbody is not None else table
    all_rows = rows_container.find_all("tr")
    # 排除表頭列本身（如果 thead 不存在、表頭是表格內第一個 tr）
    body_rows = [r for r in all_rows if not r.find_all("th")]
    return body_rows


def to_int(value: str, *, field: str, allow_dash_as_zero: bool = True) -> int:
    v = value.replace(",", "").strip()
    if v in ("", "-", "--") and allow_dash_as_zero:
        return 0
    try:
        return int(v)
    except ValueError as exc:
        raise ParsingError(f"欄位「{field}」的值「{value}」無法轉成整數") from exc


def to_float(value: str, *, field: str, allow_dash_as_zero: bool = True) -> float:
    v = value.replace(",", "").strip()
    if v in ("", "-", "--") and allow_dash_as_zero:
        return 0.0
    try:
        return float(v)
    except ValueError as exc:
        raise ParsingError(f"欄位「{field}」的值「{value}」無法轉成浮點數") from exc
