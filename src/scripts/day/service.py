"""
日常写作服务层
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Any

from .pipeline import run_pipeline


class DayService:
    """
    日常写作服务

    提供统一的 API 接口，封装日常写作功能
    """

    def __init__(self, project_root: Path):
        self.project_root = project_root

    def generate(self, slug: str, day_number: int, day_file: Optional[Path] = None,
                 summary: str = '', sex_count: int = 0, sex_details: str = '',
                 handwriting: str = '', ycm_pill: int = 0,
                 dry_run: bool = False, skip_skill: bool = True,
                 skip_check: bool = False) -> Dict[str, Any]:
        """
        生成日常写作

        Args:
            slug: 角色标识
            day_number: Day 编号
            day_file: Day 文件路径
            summary: 当天摘要
            sex_count: 性爱次数
            sex_details: 性爱详情
            handwriting: 手心写字
            ycm_pill: 优思明颗数
            dry_run: 只输出变更，不写入
            skip_skill: 跳过 SKILL.md 重建
            skip_check: 跳过逻辑检查

        Returns:
            Dict: 响应结果
        """
        try:
            if day_file is None:
                day_file = self.project_root / 'crushes' / slug / 'memories' / 'chats' / f'day{day_number}.md'

            if not day_file.exists():
                return {
                    'success': False,
                    'errors': [f'Day file not found: {day_file}'],
                }

            run_pipeline(
                slug=slug,
                day_number=day_number,
                day_file=day_file,
                summary=summary,
                sex_count=sex_count,
                sex_details=sex_details,
                handwriting=handwriting,
                ycm_pill=ycm_pill,
                dry_run=dry_run,
                skip_skill=skip_skill,
                skip_check=skip_check,
            )

            return {
                'success': True,
                'data': {
                    'slug': slug,
                    'day_number': day_number,
                    'summary': summary,
                },
            }
        except Exception as e:
            return {
                'success': False,
                'errors': [str(e)],
            }

    def list(self, slug: str, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """
        获取日常写作列表

        Args:
            slug: 角色标识
            page: 页码
            page_size: 每页数量

        Returns:
            Dict: 响应结果
        """
        try:
            crush_dir = self.project_root / 'crushes' / slug
            chats_dir = crush_dir / 'memories' / 'chats'

            if not chats_dir.exists():
                return {
                    'success': True,
                    'data': [],
                    'total': 0,
                }

            days = []
            for day_file in sorted(chats_dir.glob('day*.md')):
                day_number = int(day_file.stem.replace('day', ''))
                content = day_file.read_text(encoding='utf-8')
                days.append({
                    'slug': slug,
                    'day_number': day_number,
                    'content': content[:200],  # 只返回前 200 字符
                    'file_path': str(day_file),
                })

            # 分页
            start = (page - 1) * page_size
            end = start + page_size
            paginated_days = days[start:end]

            return {
                'success': True,
                'data': paginated_days,
                'total': len(days),
            }
        except Exception as e:
            return {
                'success': False,
                'errors': [str(e)],
            }

    def get(self, slug: str, day_number: int) -> Dict[str, Any]:
        """
        获取日常写作详情

        Args:
            slug: 角色标识
            day_number: Day 编号

        Returns:
            Dict: 响应结果
        """
        try:
            day_file = self.project_root / 'crushes' / slug / 'memories' / 'chats' / f'day{day_number}.md'

            if not day_file.exists():
                return {
                    'success': False,
                    'errors': [f'Day file not found: {day_file}'],
                }

            content = day_file.read_text(encoding='utf-8')

            return {
                'success': True,
                'data': {
                    'slug': slug,
                    'day_number': day_number,
                    'content': content,
                    'file_path': str(day_file),
                },
            }
        except Exception as e:
            return {
                'success': False,
                'errors': [str(e)],
            }

    def update(self, slug: str, day_number: int, content: str) -> Dict[str, Any]:
        """
        更新日常写作

        Args:
            slug: 角色标识
            day_number: Day 编号
            content: 内容

        Returns:
            Dict: 响应结果
        """
        try:
            day_file = self.project_root / 'crushes' / slug / 'memories' / 'chats' / f'day{day_number}.md'

            if not day_file.exists():
                return {
                    'success': False,
                    'errors': [f'Day file not found: {day_file}'],
                }

            day_file.write_text(content, encoding='utf-8')

            return {
                'success': True,
                'data': {
                    'slug': slug,
                    'day_number': day_number,
                    'content': content,
                },
            }
        except Exception as e:
            return {
                'success': False,
                'errors': [str(e)],
            }

    def delete(self, slug: str, day_number: int) -> Dict[str, Any]:
        """
        删除日常写作

        Args:
            slug: 角色标识
            day_number: Day 编号

        Returns:
            Dict: 响应结果
        """
        try:
            day_file = self.project_root / 'crushes' / slug / 'memories' / 'chats' / f'day{day_number}.md'

            if not day_file.exists():
                return {
                    'success': False,
                    'errors': [f'Day file not found: {day_file}'],
                }

            day_file.unlink()

            return {
                'success': True,
                'data': {
                    'slug': slug,
                    'day_number': day_number,
                },
            }
        except Exception as e:
            return {
                'success': False,
                'errors': [str(e)],
            }


def _main() -> int:
    """CLI 入口：解析参数并调用 DayService 对应方法，输出 JSON。"""
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description="日常写作服务 CLI")
    parser.add_argument("--action", required=True,
                        choices=["generate", "list", "get", "update", "delete"],
                        help="操作类型")
    parser.add_argument("--slug", required=True, help="角色标识")
    parser.add_argument("--day-number", type=int, default=None,
                        help="Day 编号（generate/get/update/delete 需要）")
    parser.add_argument("--content", default=None, help="写作内容（update 需要）")
    parser.add_argument("--summary", default="", help="当天摘要（generate 可选）")
    parser.add_argument("--page", type=int, default=1, help="页码（list 可选，默认 1）")
    parser.add_argument("--page-size", type=int, default=20, help="每页数量（list 可选，默认 20）")

    args = parser.parse_args()

    # project_root = 当前文件所在 src/scripts/day/ -> 向上三级到项目根
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    service = DayService(project_root)

    try:
        if args.action == "generate":
            if args.day_number is None:
                print(json.dumps({"success": False, "errors": ["--day-number is required for generate"]},
                                 ensure_ascii=False))
                return 1
            result = service.generate(
                slug=args.slug,
                day_number=args.day_number,
                summary=args.summary,
            )
            print(json.dumps(result, ensure_ascii=False))

        elif args.action == "list":
            result = service.list(
                slug=args.slug,
                page=args.page,
                page_size=args.page_size,
            )
            print(json.dumps(result, ensure_ascii=False))

        elif args.action == "get":
            if args.day_number is None:
                print(json.dumps({"success": False, "errors": ["--day-number is required for get"]},
                                 ensure_ascii=False))
                return 1
            result = service.get(slug=args.slug, day_number=args.day_number)
            print(json.dumps(result, ensure_ascii=False))

        elif args.action == "update":
            if args.day_number is None or args.content is None:
                print(json.dumps({"success": False, "errors": ["--day-number and --content are required for update"]},
                                 ensure_ascii=False))
                return 1
            result = service.update(
                slug=args.slug,
                day_number=args.day_number,
                content=args.content,
            )
            print(json.dumps(result, ensure_ascii=False))

        elif args.action == "delete":
            if args.day_number is None:
                print(json.dumps({"success": False, "errors": ["--day-number is required for delete"]},
                                 ensure_ascii=False))
                return 1
            result = service.delete(slug=args.slug, day_number=args.day_number)
            print(json.dumps(result, ensure_ascii=False))

        return 0

    except Exception as e:
        print(json.dumps({"success": False, "errors": [str(e)]}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(_main())
