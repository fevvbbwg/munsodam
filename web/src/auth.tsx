import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, BookOpen, Check, Eye, EyeOff, KeyRound, LockKeyhole, Mail, UserRound } from 'lucide-react'

export type AuthUser = { id: string; email: string | null; display_name: string; auth_method: 'email' | 'kakao' }
type User = AuthUser
type AuthValue = { user: User; logout: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthGate')
  return value
}

function LoginPage({ onAuthenticated, initialMode }: { onAuthenticated: (user: User) => void; initialMode: 'login' | 'register' }) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [kakaoEnabled, setKakaoEnabled] = useState(false)
  const passwordStrength = [password.length >= 8, /\p{L}/u.test(password), /\p{N}/u.test(password), password.length >= 12].filter(Boolean).length
  const strengthLabel = password.length === 0 ? '8자 이상 입력해 주세요' : passwordStrength <= 1 ? '조금 더 길고 다양한 문자를 사용해 보세요' : passwordStrength <= 2 ? '보통' : passwordStrength === 3 ? '좋음' : '강함'
  useEffect(() => { fetch('/api/auth/providers').then(response => response.json()).then(data => setKakaoEnabled(Boolean(data.kakao))).catch(() => setKakaoEnabled(false)) }, [])
  useEffect(() => {
    const oauth = new URLSearchParams(window.location.search).get('oauth')
    if (oauth === 'kakao_cancelled') setError('카카오 로그인을 취소했어요. 다시 시도하거나 이메일로 로그인해 주세요.')
    else if (oauth === 'kakao_failed') setError('카카오 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')
    if (oauth?.startsWith('kakao_')) window.history.replaceState({}, '', window.location.pathname)
  }, [])
  useEffect(() => {
    const syncMode = () => setMode(location.pathname === '/signup' ? 'register' : 'login')
    window.addEventListener('popstate', syncMode)
    document.title = `${mode === 'login' ? '로그인' : '회원가입'} · 문서담`
    return () => window.removeEventListener('popstate', syncMode)
  }, [mode])

  function switchMode(next: 'login' | 'register') {
    const nextPath = next === 'register' ? '/signup' : '/login'
    if (location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
    setMode(next)
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (mode === 'register' && password !== passwordConfirm) {
      setError('비밀번호가 서로 일치하지 않습니다.')
      return
    }
    setBusy(true)
    try {
      const response = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { email, password } : { display_name: name, email, password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : '요청을 처리하지 못했습니다.')
      onAuthenticated(payload as User)
    } catch (cause) {
      setError(cause instanceof TypeError ? '로그인 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.' : cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function kakaoLogin() {
    setError('')
    if (!kakaoEnabled) {
      setError('카카오 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.')
      return
    }
    setBusy(true)
    const authPages = ['/login', '/signup', '/find-id', '/forgot-password', '/reset-password']
    const returnPath = authPages.includes(window.location.pathname)
      ? '/'
      : `${window.location.pathname}${window.location.search}${window.location.hash}`
    const params = new URLSearchParams({ next: returnPath })
    window.location.assign(`/api/auth/kakao?${params.toString()}`)
  }

  return <main className="auth-page">
    <section className="auth-story">
      <a className="brand auth-brand" href="/" aria-label="문서담 홈"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path className="brand-sheet-back" d="M8.5 11h15l6 6v16H8.5z"/><path className="brand-sheet-front" d="M13 7h11l7 7v18H13z"/><path className="brand-fold" d="M24 7v7h7"/><path className="brand-lines" d="M17 20h10M17 24h10M17 28h6"/></svg></span><span className="brand-name">문서담 <small>사내 자료실</small></span></a>
      <div className="auth-story-copy"><span className="page-kicker">사내 문서 검색</span><h1>필요한 사내 자료를<br/>한곳에서 찾으세요.</h1><p>문서 검색부터 답변의 원문 확인까지 한곳에서.</p></div>
      <div className="auth-benefits"><div><span><Check size={15}/></span><p><strong>계정별 자료실</strong><small>문서와 검색 기록을 내 계정에 따로 보관합니다.</small></p></div><div><span><BookOpen size={15}/></span><p><strong>근거 문장과 원문 위치</strong><small>답변에 사용한 문서 구간을 바로 확인할 수 있습니다.</small></p></div></div>
      <span className="auth-story-foot">문서담 · 사내 자료 검색</span>
    </section>
    <section className="auth-panel" aria-labelledby="auth-heading">
      <div className="auth-card">
        <span className="auth-mobile-mark"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path className="brand-sheet-back" d="M8.5 11h15l6 6v16H8.5z"/><path className="brand-sheet-front" d="M13 7h11l7 7v18H13z"/><path className="brand-fold" d="M24 7v7h7"/><path className="brand-lines" d="M17 20h10M17 24h10M17 28h6"/></svg></span></span>
        <span className="auth-eyebrow">{mode === 'login' ? '내 자료실 로그인' : '새 계정 만들기'}</span>
        <h2 id="auth-heading">{mode === 'login' ? '로그인' : '계정 만들기'}</h2>
        <p className="auth-description">{mode === 'login' ? '문서 검색과 저장한 근거를 이어서 이용하세요.' : '문서와 검색 기록을 계정별로 보관합니다. 첫 계정은 현재 자료실의 기존 문서도 이어받습니다.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <label><span>이름</span><div className="auth-input"><UserRound size={17}/><input autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="이름을 입력해 주세요" required maxLength={80}/></div></label>}
          <label><span>{mode === 'register' ? '이메일 · 로그인 아이디' : '이메일'}</span><div className="auth-input"><Mail size={17}/><input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" required maxLength={320}/></div></label>
          <label><span>비밀번호</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? '8자 이상 입력해 주세요' : '비밀번호를 입력해 주세요'} required minLength={mode === 'register' ? 8 : 1} maxLength={128}/><button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
          {mode === 'register' && <>
            <div className={`password-strength strength-${passwordStrength}`} aria-live="polite"><div className="password-strength-bars" aria-hidden="true">{[1, 2, 3, 4].map(level => <span key={level} className={passwordStrength >= level ? 'filled' : ''}/>)}</div><span>{strengthLabel}</span></div>
            <label><span>비밀번호 확인</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={passwordConfirm} onChange={event => setPasswordConfirm(event.target.value)} placeholder="비밀번호를 한 번 더 입력해 주세요" required minLength={8} maxLength={128}/></div></label>
          </>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? '잠시만요…' : mode === 'login' ? '로그인' : '계정 만들기'} {!busy && <ArrowRight size={16}/>}</button>
        </form>
        {mode === 'login' && <div className="auth-recovery-links"><a href="/find-id">아이디 찾기</a><span aria-hidden="true">·</span><a href="/forgot-password">비밀번호 찾기</a></div>}
        <div className="auth-divider"><span>또는</span></div>
        <button className={`kakao-login${kakaoEnabled ? '' : ' kakao-unavailable'}`} type="button" onClick={() => void kakaoLogin()} disabled={busy || !kakaoEnabled} aria-describedby={!kakaoEnabled ? 'kakao-login-note' : undefined}><span className="kakao-symbol" aria-hidden="true" />{kakaoEnabled ? '카카오로 계속하기' : '카카오 로그인'}</button>
        {!kakaoEnabled && <p className="auth-provider-note" id="kakao-login-note">카카오 로그인을 사용할 수 있도록 서비스 설정이 필요합니다. 현재는 이메일로 로그인해 주세요.</p>}
        <p className="auth-switch">{mode === 'login' ? '처음 오셨나요?' : '이미 계정이 있나요?'} <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '계정 만들기' : '로그인'}</button></p>
        <p className="auth-privacy">계정별 문서와 검색 내용은 다른 사용자에게 공개되지 않습니다.</p>
      </div>
    </section>
  </main>
}

function RecoveryPage() {
  const path = window.location.pathname
  const isFindId = path === '/find-id'
  const isReset = path === '/reset-password'
  const [email, setEmail] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const [emailResetEnabled, setEmailResetEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [foundEmail, setFoundEmail] = useState('')
  const [complete, setComplete] = useState(false)
  const [invalidResetLink, setInvalidResetLink] = useState(false)
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const codeRecoveryActive = emailResetEnabled === false || useRecoveryCode

  useEffect(() => {
    const title = isFindId ? '아이디 찾기' : isReset ? '비밀번호 재설정' : '비밀번호 찾기'
    document.title = `${title} · 문서담`
    fetch('/api/auth/providers').then(response => response.json()).then(data => setEmailResetEnabled(Boolean(data.email_reset))).catch(() => setEmailResetEnabled(false))
  }, [isFindId, isReset])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (isFindId) setFoundEmail('')
    const recoveryCodeMode = !isFindId && !isReset && codeRecoveryActive
    if ((isReset || recoveryCodeMode) && password !== confirmPassword) {
      setError('새 비밀번호가 서로 일치하지 않습니다.')
      return
    }
    setBusy(true)
    try {
      const endpoint = isFindId ? '/api/auth/id-recovery' : isReset ? '/api/auth/password-reset/confirm' : recoveryCodeMode ? '/api/auth/password-reset/recovery' : '/api/auth/password-reset/request'
      const body = isFindId
        ? { recovery_code: recoveryCode }
        : isReset
        ? { token, password }
        : recoveryCodeMode
          ? { email: recoveryEmail, recovery_code: recoveryCode, new_password: password }
          : { email }
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (isReset && response.status === 400) {
          setInvalidResetLink(true)
          setPassword('')
          setConfirmPassword('')
          return
        }
        throw new Error(typeof payload.detail === 'string' ? payload.detail : '요청을 처리하지 못했습니다.')
      }
      if (isFindId) setFoundEmail(payload.email ?? '')
      else if (isReset || recoveryCodeMode) setComplete(true)
      else setMessage('가입된 이메일이라면 30분 동안 유효한 재설정 링크를 보냈습니다. 받은 편지함을 확인해 주세요.')
    } catch (cause) {
      setError(cause instanceof TypeError ? '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' : cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const title = isFindId ? '아이디 찾기' : isReset ? '새 비밀번호 설정' : '비밀번호 찾기'
  return <main className="auth-page recovery-page">
    <section className="auth-story">
      <a className="brand auth-brand" href="/" aria-label="문서담 홈"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path className="brand-sheet-back" d="M8.5 11h15l6 6v16H8.5z"/><path className="brand-sheet-front" d="M13 7h11l7 7v18H13z"/><path className="brand-fold" d="M24 7v7h7"/><path className="brand-lines" d="M17 20h10M17 24h10M17 28h6"/></svg></span><span className="brand-name">문서담 <small>사내 자료실</small></span></a>
      <div className="auth-story-copy"><span className="page-kicker">ACCOUNT HELP</span><h1>계정에 다시<br/>접속하세요.</h1><p>{isFindId ? '문서담 아이디는 가입 이메일 주소입니다.' : isReset ? '이메일로 받은 일회용 확인 링크에서 새 비밀번호를 설정합니다.' : emailResetEnabled === null ? '계정 복구 방법을 확인하고 있습니다.' : codeRecoveryActive ? '미리 저장한 복구 코드로 이메일 설정 없이 비밀번호를 바꿀 수 있습니다.' : '가입 이메일로 일회용 비밀번호 재설정 링크를 받으세요.'}</p></div>
      <span className="auth-story-foot">문서담 · 계정 도움말</span>
    </section>
    <section className="auth-panel" aria-labelledby="recovery-heading"><div className="auth-card recovery-card">
      <span className="auth-eyebrow">계정 도움말</span><h2 id="recovery-heading">{complete ? '변경 완료' : title}</h2>
      {isFindId ? <>
        <p className="auth-description">문서담 아이디는 가입 이메일입니다. 계정 관리에서 미리 발급해 둔 복구 코드로 아이디를 확인할 수 있습니다.</p>
        <form className="auth-form" onSubmit={submit}>
          <label><span>복구 코드</span><div className="auth-input"><KeyRound size={17}/><input type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={recoveryCode} onChange={event => setRecoveryCode(event.target.value.toUpperCase())} required minLength={16} maxLength={48} placeholder="ABCD1234-EF567890-12345678-90ABCDEF"/></div></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {foundEmail && <div className="auth-success id-recovery-result" role="status"><span>로그인 아이디</span><strong>{foundEmail}</strong></div>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? '확인 중…' : '아이디 확인'} {!busy && <ArrowRight size={16}/>}</button>
        </form>
        <div className="recovery-info"><Mail size={17}/><p><strong>복구 코드가 없나요?</strong><span>복구 코드 없이 이 화면에서 아이디를 조회할 수는 없습니다. 가입할 때 사용한 이메일이 로그인 아이디예요. 브라우저나 비밀번호 관리자에 저장한 로그인 정보를 확인해 보세요.</span></p></div>
        <a className="auth-submit recovery-action" href="/login">로그인으로 돌아가기 <ArrowRight size={16}/></a>
        <a className="recovery-secondary-link" href="/forgot-password">비밀번호도 기억나지 않나요?</a>
      </> : complete ? <>
        <p className="auth-description">새 비밀번호를 저장했습니다. 새 비밀번호로 로그인해 주세요.</p>
        <a className="auth-submit recovery-action" href="/login">로그인하기 <ArrowRight size={16}/></a>
      </> : isReset ? <>
        <p className="auth-description">새 비밀번호를 입력해 주세요. 재설정 링크는 한 번만 사용할 수 있습니다.</p>
        {!token || invalidResetLink ? <>
          <p className="auth-error" role="alert">{invalidResetLink ? '재설정 링크를 사용할 수 없습니다. 만료됐거나 이미 사용한 링크일 수 있어요.' : '재설정 링크가 없어요. 새 링크를 요청한 뒤 이메일에 있는 링크를 열어 주세요.'}</p>
          <a className="auth-submit recovery-action" href="/forgot-password">새 재설정 링크 요청 <ArrowRight size={16}/></a>
        </> : <form className="auth-form" onSubmit={submit}>
          <label><span>새 비밀번호</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} placeholder="8자 이상 입력해 주세요"/><button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
          <label><span>새 비밀번호 확인</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength={8} maxLength={128} placeholder="비밀번호를 한 번 더 입력해 주세요"/><button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? '저장 중…' : '비밀번호 변경'} {!busy && <ArrowRight size={16}/>}</button>
        </form>
        }
      </> : <>
        <p className="auth-description">{emailResetEnabled === null ? '복구 방법을 확인하고 있어요.' : codeRecoveryActive ? '가입 이메일과 미리 저장한 복구 코드로 비밀번호를 변경할 수 있습니다.' : '가입한 이메일을 입력하면 30분 동안 유효한 비밀번호 재설정 링크를 보내드립니다.'}</p>
        {emailResetEnabled !== null && <>
        {emailResetEnabled && <div className="recovery-method-tabs" role="tablist" aria-label="비밀번호 복구 방법"><button type="button" role="tab" aria-selected={!useRecoveryCode} className={!useRecoveryCode ? 'active' : ''} onClick={() => { setUseRecoveryCode(false); setError(''); setMessage('') }}>이메일 링크</button><button type="button" role="tab" aria-selected={useRecoveryCode} className={useRecoveryCode ? 'active' : ''} onClick={() => { setUseRecoveryCode(true); setError(''); setMessage('') }}>복구 코드</button></div>}
        {codeRecoveryActive ? <>
          <p className="recovery-method-description">계정 관리에서 미리 발급해 둔 복구 코드와 가입 이메일을 입력해 주세요. 비밀번호 변경이 완료되면 코드는 폐기됩니다.</p>
          <form className="auth-form" onSubmit={submit}>
            <label><span>가입 이메일 · 로그인 아이디</span><div className="auth-input"><Mail size={17}/><input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={recoveryEmail} onChange={event => setRecoveryEmail(event.target.value)} required maxLength={320} placeholder="name@company.com"/></div></label>
            <label><span>복구 코드</span><div className="auth-input"><KeyRound size={17}/><input type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={recoveryCode} onChange={event => setRecoveryCode(event.target.value.toUpperCase())} required minLength={16} maxLength={48} placeholder="ABCD1234-EF567890-12345678-90ABCDEF"/></div></label>
            <label><span>새 비밀번호</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} placeholder="8자 이상 입력해 주세요"/><button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
            <label><span>새 비밀번호 확인</span><div className="auth-input"><LockKeyhole size={17}/><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength={8} maxLength={128}/><button type="button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? '확인 중…' : '복구 코드로 비밀번호 변경'} {!busy && <ArrowRight size={16}/>}</button>
          </form>
          <div className="recovery-info"><KeyRound size={16}/><div className="recovery-info-copy"><strong>복구 코드를 가지고 있지 않다면</strong><span>{emailResetEnabled ? '이 코드는 사용할 수 없습니다. 가입 이메일로 재설정 링크를 요청해 주세요.' : '이 환경에는 이메일 재설정이 설정되어 있지 않습니다. 복구 코드를 미리 발급하지 않았다면 비밀번호를 재설정할 수 없습니다.'}</span>{emailResetEnabled && <button className="recovery-info-action" type="button" onClick={() => { setUseRecoveryCode(false); setError(''); setMessage('') }}>이메일 링크로 전환 <ArrowRight size={13}/></button>}</div></div>
        </> : <>
          <form className="auth-form" onSubmit={submit}>
            <label><span>가입 이메일</span><div className="auth-input"><Mail size={17}/><input type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} required maxLength={320} placeholder="name@company.com"/></div></label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            {message && <p className="auth-success" role="status">{message}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? '요청 중…' : '재설정 링크 받기'} {!busy && <ArrowRight size={16}/>}</button>
          </form>
        </>}
        </>}
        <a className="recovery-secondary-link" href="/find-id">아이디가 기억나지 않나요?</a>
      </>}
      {!isFindId && !complete && <p className="auth-switch"><a href="/login">로그인으로 돌아가기</a></p>}
    </div></section>
  </main>
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    let active = true
    fetch('/api/auth/me').then(async response => {
      if (!response.ok) return null
      return await response.json() as User
    }).catch(() => null).then(current => {
      if (!active) return
      if (current && (location.pathname === '/login' || location.pathname === '/signup')) window.history.replaceState({}, '', '/')
      setUser(current)
      setChecked(true)
    })
    return () => { active = false }
  }, [])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
  }

  if (!checked) return <main className="auth-loading" aria-label="로그인 확인 중"><span className="brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path className="brand-sheet-back" d="M8.5 11h15l6 6v16H8.5z"/><path className="brand-sheet-front" d="M13 7h11l7 7v18H13z"/><path className="brand-fold" d="M24 7v7h7"/><path className="brand-lines" d="M17 20h10M17 24h10M17 28h6"/></svg></span></main>
  if (['/find-id', '/forgot-password', '/reset-password'].includes(location.pathname)) return <RecoveryPage />
  if (!user) return <LoginPage key={location.pathname === '/signup' ? 'signup' : 'login'} initialMode={location.pathname === '/signup' ? 'register' : 'login'} onAuthenticated={current => {
    if (location.pathname === '/login' || location.pathname === '/signup') window.history.replaceState({}, '', '/')
    setUser(current)
  }}/>
  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>
}
