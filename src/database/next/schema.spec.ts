/**
 * 새 스키마(1.0.15)가 설계와 같은지 본다. 표 이름 · 칸 이름 · 형 · 가리키는 표 · enum 의 값을 견준다.
 *
 * `design-tables.json` 은 설계 페이지의 원본에서 뽑은 목록이다(앱 저장소 ADR-099, jini520/maple-routine#947). 설계가 바뀌면 다시
 * 뽑아 이 파일을 바꾼다. 손으로 쓴 카드는 한 줄에 칸 여럿을 `a · b` 로 적거나 형을 비워 둔 곳이 있다. 그런 줄은 이름만 견준다.
 */
import { is } from 'drizzle-orm'
import { getTableConfig, isPgEnum, PgTable } from 'drizzle-orm/pg-core'

import design from './design-tables.json'
import * as next from './index'

/** 아직 쓰지 않은 표의 수. 묶음을 더할 때마다 줄인다. 0 이 되면 새 스키마가 다 된 것이다. */
const REMAINING = 92

interface DesignColumn {
  name: string
  type: string
  references: string | null
}

/** 설계가 형을 하나로 적은 칸만 견준다. 값은 Postgres 가 부르는 이름이다. */
const SQL_TYPE: Record<string, string> = {
  uuid: 'uuid',
  text: 'text',
  integer: 'integer',
  bigint: 'bigint',
  smallint: 'smallint',
  boolean: 'boolean',
  date: 'date',
  numeric: 'numeric',
  double: 'double precision',
  bytea: 'bytea',
  timestamptz: 'timestamp with time zone',
  'text[]': 'text[]',
}

const COLUMN_NAME = /^[a-z][a-z0-9_]*$/

const designTables = new Map(
  design.tables.map((table) => [table.name, table.columns as DesignColumn[]]),
)

/** 내보낸 것을 표와 enum 으로 가른다. 값의 합 타입으로는 타입 가드가 좁혀지지 않아 unknown 으로 받는다. */
const exported: unknown[] = Object.values(next)

const tables = exported
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableConfig(table))

const enums = exported.filter(isPgEnum)

/** 설계의 한 줄을 칸 이름으로 편다. 칸 이름이 아닌 줄은 카드의 설명이라 뺀다. */
function designNames(columns: DesignColumn[]): string[] {
  return columns
    .flatMap((column) => column.name.split(' · '))
    .filter((name) => COLUMN_NAME.test(name))
}

function expectedSqlType(type: string): string | undefined {
  return type.startsWith('enum ') ? type.slice('enum '.length) : SQL_TYPE[type]
}

describe('새 스키마와 설계', () => {
  it('새 스키마의 표는 모두 설계에 있고 칸 이름이 같다', () => {
    for (const table of tables) {
      const columns = designTables.get(table.name)
      expect({ table: table.name, inDesign: columns !== undefined }).toEqual({
        table: table.name,
        inDesign: true,
      })
      expect({
        table: table.name,
        columns: table.columns.map((column) => column.name).sort(),
      }).toEqual({
        table: table.name,
        columns: designNames(columns ?? []).sort(),
      })
    }
  })

  it('설계가 형을 하나로 적은 칸은 형이 같다', () => {
    for (const table of tables) {
      for (const column of designTables.get(table.name) ?? []) {
        const expected = expectedSqlType(column.type)
        if (expected === undefined || !COLUMN_NAME.test(column.name)) continue
        const actual = table.columns.find((one) => one.name === column.name)
        expect({ column: `${table.name}.${column.name}`, type: actual?.getSQLType() }).toEqual({
          column: `${table.name}.${column.name}`,
          type: expected,
        })
      }
    }
  })

  // 설계가 `uuid → 표` 로 적은 칸은 그 표를 참조해야 한다. 아직 쓰지 않은 표를 가리키는 칸은 그 표를 쓸 때 건다.
  it('설계가 가리키는 표를 적은 칸은 그 표를 참조한다', () => {
    const written = new Set(tables.map((table) => table.name))
    for (const table of tables) {
      const references = new Map(
        table.foreignKeys.flatMap((key) => {
          const reference = key.reference()
          return reference.columns.map((column) => [
            column.name,
            getTableConfig(reference.foreignTable).name,
          ])
        }),
      )
      for (const column of designTables.get(table.name) ?? []) {
        if (column.references === null || !written.has(column.references)) continue
        expect({
          column: `${table.name}.${column.name}`,
          references: references.get(column.name),
        }).toEqual({
          column: `${table.name}.${column.name}`,
          references: column.references,
        })
      }
    }
  })

  it('새 스키마의 enum 은 설계의 값과 같다', () => {
    const designEnums = design.enums as Record<string, { values: string[] }>
    for (const one of enums) {
      expect({ enum: one.enumName, values: [...one.enumValues] }).toEqual({
        enum: one.enumName,
        values: designEnums[one.enumName]?.values,
      })
    }
  })

  it('아직 쓰지 않은 표의 수가 적어 둔 것과 같다', () => {
    const written = new Set(tables.map((table) => table.name))
    const missing = [...designTables.keys()].filter((name) => !written.has(name))
    expect(missing).toHaveLength(REMAINING)
  })
})
