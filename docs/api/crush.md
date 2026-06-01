# 角色管理 API

## 创建角色

```typescript
interface CreateCrushRequest {
  name: string;
  nickname: string;
  slug: string;
}

interface CreateCrushResponse {
  success: boolean;
  data?: {
    slug: string;
    name: string;
    nickname: string;
    created_at: string;
    updated_at: string;
  };
  errors?: string[];
}
```

## 获取角色列表

```typescript
interface GetCrushesRequest {
  page?: number;
  page_size?: number;
}

interface GetCrushesResponse {
  success: boolean;
  data?: Array<{
    slug: string;
    name: string;
    nickname: string;
    created_at: string;
    updated_at: string;
  }>;
  total?: number;
  errors?: string[];
}
```

## 获取角色详情

```typescript
interface GetCrushRequest {
  slug: string;
}

interface GetCrushResponse {
  success: boolean;
  data?: {
    slug: string;
    name: string;
    nickname: string;
    created_at: string;
    updated_at: string;
  };
  errors?: string[];
}
```

## 更新角色

```typescript
interface UpdateCrushRequest {
  slug: string;
  name?: string;
  nickname?: string;
}

interface UpdateCrushResponse {
  success: boolean;
  data?: {
    slug: string;
    name: string;
    nickname: string;
    created_at: string;
    updated_at: string;
  };
  errors?: string[];
}
```

## 删除角色

```typescript
interface DeleteCrushRequest {
  slug: string;
}

interface DeleteCrushResponse {
  success: boolean;
  data?: {
    slug: string;
  };
  errors?: string[];
}
```
