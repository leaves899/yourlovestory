# 碎片日记 API

## 记录碎片

```typescript
interface RecordFragmentRequest {
  slug: string;
  origin: 'user' | 'crush' | 'ambient';
  mood: 'positive' | 'negative' | 'neutral' | 'mixed';
  content: string;
  env_tags?: string[];
  behavior_tags?: string[];
}

interface RecordFragmentResponse {
  success: boolean;
  data?: {
    id: string;
    slug: string;
    origin: string;
    mood: string;
    content: string;
    env_tags: string[];
    behavior_tags: string[];
    created_at: string;
    updated_at: string;
  };
  errors?: string[];
}
```

## 获取碎片列表

```typescript
interface GetFragmentsRequest {
  slug: string;
  date?: string;
  page?: number;
  page_size?: number;
}

interface GetFragmentsResponse {
  success: boolean;
  data?: Array<{
    id: string;
    slug: string;
    origin: string;
    mood: string;
    content: string;
    env_tags: string[];
    behavior_tags: string[];
    created_at: string;
    updated_at: string;
  }>;
  total?: number;
  errors?: string[];
}
```

## 获取碎片详情

```typescript
interface GetFragmentRequest {
  slug: string;
  fragment_id: string;
}

interface GetFragmentResponse {
  success: boolean;
  data?: {
    id: string;
    slug: string;
    origin: string;
    mood: string;
    content: string;
    env_tags: string[];
    behavior_tags: string[];
    created_at: string;
    updated_at: string;
  };
  errors?: string[];
}
```

## 更新碎片

```typescript
interface UpdateFragmentRequest {
  slug: string;
  fragment_id: string;
  content?: string;
  env_tags?: string[];
  behavior_tags?: string[];
}

interface UpdateFragmentResponse {
  success: boolean;
  data?: {
    id: string;
    slug: string;
    origin: string;
    mood: string;
    content: string;
    env_tags: string[];
    behavior_tags: string[];
    created_at: string;
    updated_at: string;
  };
  errors?: string[];
}
```

## 删除碎片

```typescript
interface DeleteFragmentRequest {
  slug: string;
  fragment_id: string;
}

interface DeleteFragmentResponse {
  success: boolean;
  data?: {
    id: string;
    slug: string;
  };
  errors?: string[];
}
```

## 整合碎片

```typescript
interface IntegrateFragmentsRequest {
  slug: string;
  date: string;
}

interface IntegrateFragmentsResponse {
  success: boolean;
  data?: {
    slug: string;
    day_number: number;
    content: string;
  };
  errors?: string[];
}
```
