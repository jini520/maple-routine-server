import { autoLabels, type LabelSource, REGION_KINDS } from './asset-labels'
import { ASSET_USES } from './asset-uses'

const use = (kind: string, name: string) => ({ kind, name, itemCategory: null })

describe('autoLabels', () => {
  it('지도 아이콘은 컨텐츠보다 사냥 지역 이름을 보이고, 같은 slug 의 지도 배경도 그 이름을 따른다', () => {
    const rows: LabelSource[] = [
      {
        dir: 'maps',
        slug: 'roadOfVanishing',
        uses: [use('컨텐츠 배경 지도', '성실한 조사에 대한 보답')],
      },
      {
        dir: 'maps/icons',
        slug: 'roadOfVanishing',
        uses: [
          use('컨텐츠 지역 아이콘', '성실한 조사에 대한 보답'),
          use('사냥 지역 아이콘', '소멸의 여로'),
        ],
      },
    ]
    expect(autoLabels(rows)).toEqual(['소멸의 여로', '소멸의 여로'])
  })

  it('사냥 지역이 없으면 지출 타일의 지역 이름을 보인다', () => {
    const rows: LabelSource[] = [
      { dir: 'maps', slug: 'aurumRegis', uses: [] },
      { dir: 'maps/icons', slug: 'aurumRegis', uses: [use('지출 타일 지도', '아우룸 레기스')] },
    ]
    expect(autoLabels(rows)).toEqual(['아우룸 레기스', '아우룸 레기스'])
  })

  it('지역이 없는 지도는 컨텐츠가 써도 파일 이름을 보인다', () => {
    const rows: LabelSource[] = [
      { dir: 'maps', slug: 'monsterPark', uses: [use('컨텐츠 배경 지도', '몬스터파크')] },
      { dir: 'maps/icons', slug: 'monsterPark', uses: [use('컨텐츠 지역 아이콘', '몬스터파크')] },
    ]
    expect(autoLabels(rows)).toEqual(['monsterPark', 'monsterPark'])
  })

  it('지도가 아닌 그림은 첫 쓰는 곳의 이름, 없으면 파일 이름을 보인다', () => {
    const rows: LabelSource[] = [
      { dir: 'bosses', slug: 'bellona', uses: [use('보스 초상', '벨로나')] },
      { dir: 'skills', slug: 'KAPCL', uses: [] },
    ]
    expect(autoLabels(rows)).toEqual(['벨로나', 'KAPCL'])
  })

  it('지역 이름을 가져오는 종류는 쓰는 곳 목록에 있는 종류다', () => {
    // 글자가 어긋나면 지도 그림이 소리 없이 파일 이름으로 돌아간다.
    const kinds = new Set<string>(ASSET_USES.map((u) => u.kind))
    expect(REGION_KINDS.filter((k) => !kinds.has(k))).toEqual([])
  })
})
