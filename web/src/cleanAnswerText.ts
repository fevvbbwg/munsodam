import type { SearchResult } from './types'

export function cleanAnswerText(answer: string, question = '', sources: SearchResult[] = []) {
  let cleaned = answer
    .split('\n\n근거 원문:')[0]
    .replace(/^\s*[-*•]?\s*.*\bsource_(?:index|indices)\s*\[[^\]]*\].*\n?/gim, '')
    .replace(/\s*\(?\s*source_(?:index|indices)\s*:\s*(?:\[[^\]]*\]|\d+(?:\s*,\s*\d+)*)\s*\)?/gi, '')
    .replace(/\s*이(?: 정보| 내용)(?:은|는) 근거\s*\d+에서 확인할 수 있습니다\.?/g, '')
    .replace(/\s*이는\s+[^\n]{0,120}?\.(?:pdf|docx|txt)\s*(?:파일|문서)?의\s+[^\n]{0,120}?(?:섹션|항목)[^\n]{0,60}?(?:명시|기재|확인)[^\n]{0,40}?[.!?。！？]/giu, '')
    .replace(/[,，]?\s*이는\s*(?:근거|출처)\s*문서[^!?。！？\n]{0,160}?(?:섹션|항목)[^!?。！？\n]{0,40}?(?:명시|확인|기재)(?:되어|돼)?\s*(?:있습니다|됩니다|돼 있습니다)/gu, '')
    .replace(/알리야/g, '알려야')
    .replace(/해야 하며(?=[.!?。！？])/g, '해야 합니다')
    .replace(/이루어져야 하며(?=[.!?。！？])/g, '이루어져야 합니다')
    .replace(/알려야 한다고 되어 있으며(?=[.!?。！？])/g, '알려야 합니다')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/[}\]]+\s*$/, '')
    .trim()

  const redundantClosingProcedure = /\s*[^.!?。！？]{1,100}(?:은|는)\s+이와 같은 절차를 따르는 것입니다[.!?。！？]\s*$/u.exec(cleaned)
  if (redundantClosingProcedure && cleaned.slice(0, redundantClosingProcedure.index).trim()) {
    cleaned = cleaned.slice(0, redundantClosingProcedure.index).trimEnd()
  }

  if (sources.length === 1) {
    const excerpt = sources[0].excerpt.trim()
    const asksForExactTime = /몇\s*시/.test(question) && !/(?:\d{1,2}\s*시|\d{1,2}:\d{2})/.test(excerpt)
    if (asksForExactTime && /근무 시작 전/.test(excerpt)) {
      return `${excerpt} 문서에는 구체적인 시각이 정해져 있지 않습니다.`
    }
    const isShortFragment = cleaned.length < 16 && /(?:언제|몇|어디|어느 곳|장소|기한|마감|누구|무엇|얼마)/.test(question)
    const isBinaryPolicyQuestion = /(?:해도 되나요|해도 돼요|가능한가요|할 수 있나요)[?.!！。？]*$/.test(question)
    if (isShortFragment || (isBinaryPolicyQuestion && /^(?:아니요|아니오|예|네)[,，\s]/.test(cleaned) && excerpt.length <= 180)) {
      return excerpt
    }

    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const phrase of excerpt.match(/(?:사용 예정일 기준 )?근무일\s*\d+\s*일\s*전|복귀 후\s*\d+\s*일\s*이내|\d+\s*시간\s*이내|하루\s*[\d,]+\s*원/g) ?? []) {
      const amount = phrase.match(/[\d,]+/)?.[0]
      if (!amount || cleaned.replace(/\s/g, '').includes(phrase.replace(/\s/g, ''))) continue
      if (/시간\s*이내/.test(phrase)) {
        cleaned = cleaned.replace(new RegExp(`${escapeRegex(amount)}\\s*시간\\s*안(?:에)?`, 'g'), phrase)
      } else if (/하루/.test(phrase)) {
        cleaned = cleaned.replace(new RegExp(`하루[^\\n.!?。！？]{0,20}${escapeRegex(amount)}\\s*원`, 'g'), phrase)
      } else if (/일\s*이내/.test(phrase)) {
        cleaned = cleaned.replace(new RegExp(`(?:복귀\\s*후\\s*)?${escapeRegex(amount)}\\s*일\\s*안(?:에)?`, 'g'), phrase)
      }
    }
  }

  return cleaned
}
