/**
 * 1.0.15 의 스키마. 표 아흔다섯과 ENUM 마흔을 묶음마다 파일로 나눠 쓴다.
 *
 * 지금 운영이 쓰는 표는 `../schema.ts` 에 있고 서버 코드는 그 파일만 읽는다. 이 폴더는 전환할 때 그 파일을 대신한다
 * (앱 저장소 ADR-099 결정 43 · 65). 표와 칸의 이름은 `design-tables.json` 과 같아야 하고 `schema.spec.ts` 가 견준다.
 */
export * from './assets'
export * from './bosses'
