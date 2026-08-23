export interface EvaluateContext {
  path: string
  ua: string
  ip: string
  mid?: string
  host?: string
  acceptLanguage?: string
  secFetchDest?: string
  secFetchMode?: string
  sgProof?: string
  sgOk?: string
  sgAuthorized?: string
  sgMidAnchor?: string
  forwardedPrefix?: string
}

export interface EvaluateContextValues {
  mid: string | null
  host: string | null
  acceptLanguage: string | null
  secFetchDest: string | null
  secFetchMode: string | null
  sgProof: string | null
  sgOk: string | null
  sgAuthorized: string | null
  sgMidAnchor: string | null
  forwardedPrefix: string | null
}

export function createEvaluateContext(path: string, ua: string, ip: string, values: EvaluateContextValues): EvaluateContext {
  const context: EvaluateContext = { path, ua, ip }
  if (values.mid !== null) context.mid = values.mid
  if (values.host !== null) context.host = values.host
  if (values.acceptLanguage !== null) context.acceptLanguage = values.acceptLanguage
  if (values.secFetchDest !== null) context.secFetchDest = values.secFetchDest
  if (values.secFetchMode !== null) context.secFetchMode = values.secFetchMode
  if (values.sgProof !== null) context.sgProof = values.sgProof
  if (values.sgOk !== null) context.sgOk = values.sgOk
  if (values.sgAuthorized !== null) context.sgAuthorized = values.sgAuthorized
  if (values.sgMidAnchor !== null) context.sgMidAnchor = values.sgMidAnchor
  if (values.forwardedPrefix !== null) context.forwardedPrefix = values.forwardedPrefix
  return context
}
