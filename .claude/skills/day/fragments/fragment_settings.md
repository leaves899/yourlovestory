# 碎片日记设置 / Fragment Journal Settings

## 功能 | Function

碎片日记的配置选项，包括 Blind 模式配置、标签推荐配置等。

## 配置文件 | Configuration File

配置文件路径：`crushes/{slug}/fragments/settings.json`

## 配置项 | Configuration Items

### Blind 模式配置

```json
{
  "blind": {
    "match_limit": 1,
    "match_threshold": 0.6,
    "show_comparison": true
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| match_limit | int | 1 | 匹配回复数量限制（最多 3） |
| match_threshold | float | 0.6 | 匹配阈值（可调整范围：50%-80%） |
| show_comparison | bool | true | 是否显示对比展示 |

### 标签推荐配置

```json
{
  "tag_recommendation": {
    "enabled": true,
    "threshold": 0.5,
    "reduced_threshold": 0.7,
    "skip_threshold": 3,
    "accept_threshold": 3
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| enabled | bool | true | 是否启用标签推荐 |
| threshold | float | 0.5 | 默认推荐阈值（50%） |
| reduced_threshold | float | 0.7 | 降频后推荐阈值（70%） |
| skip_threshold | int | 3 | 连续跳过几次触发降频 |
| accept_threshold | int | 3 | 连续接受几次恢复频率 |

### 碎片数量配置

```json
{
  "fragments": {
    "max_per_day": 10,
    "min_content_length": 5,
    "min_content_length_blind": 10,
    "max_content_length": 500,
    "max_total_length": 1000
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| max_per_day | int | 10 | 单日碎片上限 |
| min_content_length | int | 5 | Raw/Guided/Themed 最小内容长度 |
| min_content_length_blind | int | 10 | Blind 模式最小内容长度 |
| max_content_length | int | 500 | 最大内容长度 |
| max_total_length | int | 1000 | 整合后最大内容长度 |

### 归档配置

```json
{
  "archive": {
    "archive_days": 7,
    "retroactive_days": 30
  }
}
```

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| archive_days | int | 7 | 归档天数（超过此天数自动归档） |
| retroactive_days | int | 30 | 补录范围（最近 30 天内可补录） |

## 默认配置 | Default Configuration

```json
{
  "blind": {
    "match_limit": 1,
    "match_threshold": 0.6,
    "show_comparison": true
  },
  "tag_recommendation": {
    "enabled": true,
    "threshold": 0.5,
    "reduced_threshold": 0.7,
    "skip_threshold": 3,
    "accept_threshold": 3
  },
  "fragments": {
    "max_per_day": 10,
    "min_content_length": 5,
    "min_content_length_blind": 10,
    "max_content_length": 500,
    "max_total_length": 1000
  },
  "archive": {
    "archive_days": 7,
    "retroactive_days": 30
  }
}
```

## 注意事项 | Notes

- 配置文件不存在时使用默认配置
- 配置修改后立即生效
- 部分配置需要重启才能生效（如 max_per_day）
