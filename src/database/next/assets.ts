import { integer, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'

import { timestamptz } from './columns'

/** 그림 분류. 서버 코드의 고정 목록이고 선언 순서에 뜻은 없다. 옛 경로(`bosses/bellona.webp`)의 폴더에서 왔다. */
export const assetCategoryEnum = pgEnum('asset_category', [
  'skill',
  'item',
  'item_ring',
  'boss',
  'map',
  'map_icon',
  'world',
  'mvp',
  'force',
  'character',
  'drop_effect_screen',
  'drop_effect_pre',
  'drop_effect_loop',
  'drop_effect_end',
])

/**
 * 앱이 받는 그림 한 장. 게임 데이터 표의 그림 칸이 이 줄의 id 를 가리킨다.
 * 파일은 디스크에 내용 해시 이름(`<sha256>.<extension>`)으로 있다. 그림을 바꾸면 이 줄의 해시만 바뀐다.
 */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: assetCategoryEnum('category').notNull(),
    /** 확장자를 뗀 파일 이름. 관리 화면이 `name` 과 쓰는 곳의 이름이 모두 없을 때 보인다. */
    fileName: text('file_name').notNull(),
    /** `png` · `webp` · `jpg`. 디스크의 파일 이름을 만들 때 쓴다. */
    extension: text('extension').notNull(),
    /** 소문자 hex 64글자. 유일하지 않다. 내용이 같은 그림이 여러 줄일 수 있다. */
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** 픽셀. 앱이 크롭 · 연출 배치를 원래 크기로 계산한다. 내려받은 파일은 그 자리에서 크기를 모른다. */
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** 운영자가 적는 이름. 비면 그 그림을 쓰는 곳의 이름을 보인다. 앱에는 내지 않는다. */
    name: text('name'),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  // 확장자만 다른 같은 이름의 그림이 있어 확장자까지 기준에 넣는다.
  (t) => [
    unique('assets_category_file_name_extension_unique').on(t.category, t.fileName, t.extension),
  ],
)
