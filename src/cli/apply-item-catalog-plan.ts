import type { ItemAdminRow, ItemInput } from '../modules/items/items.repository'

/** 분류 확인을 마친 아이템 목록. 그림은 `items/<이름>.<확장자>` 경로이고, 여러 아이템이 한 경로를 함께 쓸 수 있다. */
export interface CatalogPlan {
  /** 서버에 이미 있는 아이템의 분류와 그림. 그림이 null 이면 그림은 건드리지 않는다. */
  items: { key: string; category: string; icon: string | null }[]
  /** 새로 더할 아이템. 역할 없이 더한다. 거래 아이템(#912)이 여기에 든다. */
  create: { key: string; name: string; category: string; icon: string | null }[]
}

export interface CatalogWrite {
  key: string
  input: ItemInput
  /** 그림 `id` 는 올린 뒤에야 알아서 경로로 둔다. null 이면 `input.iconAssetId` 그대로다. */
  iconPath: string | null
}

export interface CatalogResult {
  uploads: string[]
  creates: CatalogWrite[]
  updates: CatalogWrite[]
  /** 같은 경로에 다른 그림이 이미 있다. 덮지 않는다. */
  conflicts: string[]
  /** 고칠 key 가 서버에 없다. */
  unknown: string[]
  /** 목록이 가리키는 그림 파일이 폴더에 없다. */
  missingFiles: string[]
}

/**
 * 서버 아이템 · 그림과 목록을 견줘 할 일을 고른다. 이름 · 역할 · 레벨은 서버 값을 그대로 보내고 분류와 빈 그림만 채운다.
 * 이미 붙은 그림은 운영자가 관리 화면에서 고른 것일 수 있어 바꾸지 않는다.
 *
 * @param local 폴더에 있는 그림 경로와 그 내용 해시
 */
export function planCatalog(
  current: readonly Pick<
    ItemAdminRow,
    | 'key'
    | 'name'
    | 'category'
    | 'valuable'
    | 'worldBound'
    | 'level'
    | 'isDrop'
    | 'isEquipment'
    | 'icon'
  >[],
  serverAssets: readonly { path: string; sha256: string }[],
  plan: CatalogPlan,
  local: ReadonlyMap<string, string>,
): CatalogResult {
  const byKey = new Map(current.map((r) => [r.key, r]))
  const onServer = new Map(serverAssets.map((a) => [a.path, a.sha256]))
  const wanted = new Set<string>()
  const conflicts = new Set<string>()
  const missingFiles = new Set<string>()
  const usable = (path: string | null): string | null => {
    if (path === null) return null
    const sha = local.get(path)
    const server = onServer.get(path)
    if (server !== undefined && (sha === undefined || sha === server)) return path
    if (sha === undefined) {
      missingFiles.add(path)
      return null
    }
    if (server !== undefined) {
      conflicts.add(path)
      return null
    }
    wanted.add(path)
    return path
  }

  const updates: CatalogWrite[] = []
  const unknown: string[] = []
  const update = (key: string, category: string, icon: string | null): void => {
    const row = byKey.get(key)
    if (row === undefined) {
      unknown.push(key)
      return
    }
    const iconPath = row.icon === null ? usable(icon) : null
    if (row.category === category && iconPath === null) return
    updates.push({
      key,
      input: {
        name: row.name,
        category,
        iconAssetId: row.icon?.id ?? null,
        valuable: row.valuable,
        worldBound: row.worldBound,
        level: row.level,
        isDrop: row.isDrop,
        isEquipment: row.isEquipment,
      },
      iconPath,
    })
  }

  for (const item of plan.items) update(item.key, item.category, item.icon)
  const creates: CatalogWrite[] = []
  for (const item of plan.create) {
    if (byKey.has(item.key)) {
      update(item.key, item.category, item.icon)
      continue
    }
    creates.push({
      key: item.key,
      input: {
        name: item.name,
        category: item.category,
        iconAssetId: null,
        valuable: false,
        worldBound: false,
        level: null,
        isDrop: false,
        isEquipment: false,
      },
      iconPath: usable(item.icon),
    })
  }

  return {
    uploads: [...wanted].sort(),
    creates,
    updates,
    conflicts: [...conflicts].sort(),
    unknown,
    missingFiles: [...missingFiles].sort(),
  }
}
