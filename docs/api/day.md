# 日常写作 API

## 生成日常写作

```typescript
interface GenerateDayRequest {
  slug: string;
  day_number: number;
  summary?: string;
  sex_count?: number;
  sex_details?: string;
  handwriting?: string;
  ycm_pill?: number;
}

interface GenerateDayResponse {
  success: boolean;
  data?: {
    slug: string;
    day_number: number;
    summary: string;
  };
  errors?: string[];
}
```

## 获取日常写作列表

```typescript
interface GetDaysRequest {
  slug: string;
  page?: number;
  page_size?: number;
}

interface GetDaysResponse {
  success: boolean;
  data?: Array<{
    slug: string;
    day_number: number;
    content: string;
    file_path: string;
  }>;
  total?: number;
  errors?: string[];
}
```

## 获取日常写作详情

```typescript
interface GetDayRequest {
  slug: string;
  day_number: number;
}

interface GetDayResponse {
  success: boolean;
  data?: {
    slug: string;
    day_number: number;
    content: string;
    file_path: string;
  };
  errors?: string[];
}
```

## 更新日常写作

```typescript
interface UpdateDayRequest {
  slug: string;
  day_number: number;
  content: string;
}

interface UpdateDayResponse {
  success: boolean;
  data?: {
    slug: string;
    day_number: number;
    content: string;
  };
  errors?: string[];
}
```

## 删除日常写作

```typescript
interface DeleteDayRequest {
  slug: string;
  day_number: number;
}

interface DeleteDayResponse {
  success: boolean;
  data?: {
    slug: string;
    day_number: number;
  };
  errors?: string[];
}
```
