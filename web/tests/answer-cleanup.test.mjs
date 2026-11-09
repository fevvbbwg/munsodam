import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
})
const { cleanAnswerText } = await vite.ssrLoadModule('/src/cleanAnswerText.ts')

after(async () => vite.close())

test('keeps a multi-document comparison while removing model citation narration', () => {
  const answer = "출장비 정산 마감은 복귀 후 7일 이내에 이루어져야 하며, 이는 근거 문서 EXP-01.txt의 '정산 기한과 증빙' 섹션에서 명시되어 있습니다 (source_indices: 2). 분실 노트북 신고 기한은 노트북을 분실했을 때 1시간 이내에 IT 담당자와 관리자에게 알리야 한다고 되어 있으며, 이는 근거 문서 IT-01.txt의 '노트북 분실' 섹션에서 명시되어 있습니다 (source_indices: 1). 따라서 두 기한은 각각 '복귀 후 7일 이내'와 '분실 후 1시간 이내'로, 정량적 기간이 다르며, 비교 가능합니다.\n\n근거 원문: 원문 인용은 출처 카드에 표시됩니다."
  const sources = [
    { excerpt: '출장 비용은 복귀 후 7일 이내 정산한다.', section_path: '정산 기한과 증빙' },
    { excerpt: '노트북을 분실하면 1시간 이내에 신고한다.', section_path: '노트북 분실' },
  ]

  const visible = cleanAnswerText(answer, '출장비 정산 마감과 분실 노트북 신고 기한을 비교해 주세요.', sources)

  assert.match(visible, /복귀 후 7일 이내/)
  assert.match(visible, /1시간 이내/)
  assert.match(visible, /비교 가능합니다/)
  assert.doesNotMatch(visible, /근거 문서|source_indices|알리야|근거 원문/)
  assert.doesNotMatch(visible, /정산 기한과 증빙:|노트북 분실:/)
})

test('explains that an exact clock time is absent when the source only gives a boundary', () => {
  const answer = '근무 시작 전에 관리자에게 연락해야 합니다. 근거 원문: 당일 병가는 근무 시작 전 관리자에게 연락한다.'
  const sources = [{ excerpt: '당일 병가는 근무 시작 전 관리자에게 연락한다.', section_path: '당일 병가' }]

  assert.equal(
    cleanAnswerText(answer, '오늘 아파서 병가를 쓰려면 몇 시까지 누구에게 연락해야 해요?', sources),
    '당일 병가는 근무 시작 전 관리자에게 연락한다. 문서에는 구체적인 시각이 정해져 있지 않습니다.',
  )
})

test('removes a structured citation marker and its unmatched closing brace', () => {
  assert.equal(
    cleanAnswerText('답변입니다. source_indices: [1]}', '간단한 질문'),
    '답변입니다.',
  )
})

test('removes duplicate file and section narration while keeping the answer', () => {
  const answer = "연차는 근무일 3일 전까지 등록합니다. 이는 HR-01.txt 파일의 '계획 연차' 섹션에 명시되어 있습니다."
  assert.equal(cleanAnswerText(answer), '연차는 근무일 3일 전까지 등록합니다.')
})

test('removes a repetitive closing procedure sentence but keeps it as a standalone answer', () => {
  const answer = '분실 시 IT 담당자에게 알리고 택시 영수증을 제출합니다. 보고와 정산에 필요한 일은 이와 같은 절차를 따르는 것입니다.'
  assert.equal(cleanAnswerText(answer), '분실 시 IT 담당자에게 알리고 택시 영수증을 제출합니다.')
  const standalone = '필요한 일은 이와 같은 절차를 따르는 것입니다.'
  assert.equal(cleanAnswerText(standalone), standalone)
})
