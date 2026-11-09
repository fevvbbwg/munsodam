import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, ChevronDown, Copy, KeyRound, LogOut, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'

export default function AccountPage({
  name, email, method, onBack, onLogout,
}: {
  name: string
  email: string | null
  method: 'email' | 'kakao'
  onBack: () => void
  onLogout: () => void
}) {
  const [passwordFormOpen, setPasswordFormOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryConfigured, setRecoveryConfigured] = useState(false)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [recoveryError, setRecoveryError] = useState('')

  useEffect(() => {
    if (method !== 'email') return
    let active = true
    fetch('/api/auth/recovery-code/status').then(response => response.ok ? response.json() : null)
      .then(payload => { if (active && payload) setRecoveryConfigured(Boolean(payload.configured)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [method])

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError('')
    setPasswordMessage('')
    if (newPassword !== passwordConfirmation) {
      setPasswordError('새 비밀번호가 서로 일치하지 않습니다.')
      return
    }
    setPasswordBusy(true)
    try {
      const response = await fetch('/api/auth/password/change', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : '비밀번호를 변경하지 못했습니다.')
      setCurrentPassword('')
      setNewPassword('')
      setPasswordConfirmation('')
      setPasswordMessage('비밀번호를 변경했습니다. 현재 로그인은 유지됩니다.')
    } catch (cause) {
      setPasswordError(cause instanceof TypeError ? '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' : cause instanceof Error ? cause.message : '비밀번호를 변경하지 못했습니다.')
    } finally {
      setPasswordBusy(false)
    }
  }

  async function createRecoveryCode() {
    if ((recoveryConfigured || recoveryCode) && !window.confirm('새 코드를 만들면 이전 복구 코드는 더 이상 사용할 수 없습니다. 새 코드를 발급할까요?')) return
    setRecoveryError('')
    setRecoveryMessage('')
    setRecoveryBusy(true)
    try {
      const response = await fetch('/api/auth/recovery-code', { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : '복구 코드를 만들지 못했습니다.')
      setRecoveryCode(payload.recovery_code)
      setRecoveryConfigured(true)
      setRecoveryMessage(payload.message)
    } catch (cause) {
      setRecoveryError(cause instanceof TypeError ? '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' : cause instanceof Error ? cause.message : '복구 코드를 만들지 못했습니다.')
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function copyRecoveryCode() {
    try {
      await navigator.clipboard.writeText(recoveryCode)
      setRecoveryMessage('복구 코드를 복사했습니다. 안전한 곳에 보관해 주세요.')
    } catch {
      setRecoveryError('복사할 수 없어요. 코드를 직접 선택해 복사해 주세요.')
    }
  }

  return <section className="secondary-page account-page">
    <button className="back-link" type="button" onClick={onBack}><ArrowLeft size={15}/> 문서 검색으로</button>
    <div className="secondary-page-heading"><div><span className="page-kicker">내 계정</span><h1>계정 관리</h1><p>문서담에 로그인한 계정과 자료 보관 방식을 확인합니다.</p></div></div>
    <div className="account-profile-card">
      <div className="account-profile-avatar">{name.slice(0, 1)}</div><div><span>문서담 계정</span><h2>{name}</h2><p>{email || '카카오 계정으로 로그인'}</p></div>
    </div>
    <div className="account-settings-list">
      <article><span className="account-setting-icon"><UserRound size={17}/></span><div><strong>로그인 방식</strong><small>{method === 'kakao' ? '카카오 계정으로 로그인' : '이메일과 비밀번호로 로그인'}</small></div><span className="account-setting-status">사용 중</span></article>
      <article><span className="account-setting-icon"><LockKeyhole size={17}/></span><div><strong>로그인 상태</strong><small>안전한 쿠키로 이 브라우저에서 로그인 상태를 유지합니다.</small></div><span className="account-setting-status">보호 중</span></article>
      <article><span className="account-setting-icon"><ShieldCheck size={17}/></span><div><strong>자료 보호</strong><small>문서 원문은 외부 AI 서비스로 보내지 않으며, 로그인한 계정에서만 확인할 수 있습니다.</small></div><span className="account-setting-status">내 자료</span></article>
    </div>
    {method === 'email' && <section className="account-password-section">
      <button className="account-password-toggle" type="button" aria-expanded={passwordFormOpen} onClick={() => { setPasswordFormOpen(value => !value); setPasswordError(''); setPasswordMessage('') }}><span><LockKeyhole size={16}/> 비밀번호 변경</span><ChevronDown size={16}/></button>
      {passwordFormOpen && <form className="account-password-form" onSubmit={changePassword}>
        <label><span>현재 비밀번호</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required maxLength={128}/></label>
        <label><span>새 비밀번호</span><input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required minLength={8} maxLength={128} placeholder="8자 이상 입력해 주세요"/></label>
        <label><span>새 비밀번호 확인</span><input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} required minLength={8} maxLength={128}/></label>
        {passwordError && <p className="auth-error" role="alert">{passwordError}</p>}
        {passwordMessage && <p className="auth-success" role="status"><Check size={14}/> {passwordMessage}</p>}
        <button className="button-primary" type="submit" disabled={passwordBusy}>{passwordBusy ? '변경 중…' : '비밀번호 저장'}</button>
      </form>}
    </section>}
    {method === 'email' && <section className="account-recovery-card">
      <div className="account-recovery-heading"><span><KeyRound size={16}/></span><div><strong>계정 복구 코드</strong><small>메일을 받을 수 없을 때 아이디 확인과 비밀번호 복구에 사용할 코드를 미리 저장해 두세요.</small></div></div>
      {recoveryCode ? <div className="account-recovery-code"><code>{recoveryCode}</code><div><button type="button" onClick={() => void copyRecoveryCode()} aria-label="복구 코드 복사"><Copy size={15}/> 복사</button><button type="button" disabled={recoveryBusy} onClick={() => void createRecoveryCode()}>{recoveryBusy ? '발급 중…' : '새 코드'}</button></div></div> : <button className="account-recovery-issue" type="button" disabled={recoveryBusy} onClick={() => void createRecoveryCode()}>{recoveryBusy ? '코드 만드는 중…' : recoveryConfigured ? '새 복구 코드 발급' : '복구 코드 만들기'}</button>}
      {recoveryMessage && <p className="recovery-code-message" role="status">{recoveryMessage}</p>}
      {recoveryError && <p className="auth-error" role="alert">{recoveryError}</p>}
      <div className="account-recovery-foot"><span>코드는 한 번만 표시됩니다. 비밀번호를 재설정하면 폐기되고, 다시 발급하면 이전 코드는 무효가 됩니다.</span><a href="/forgot-password">비밀번호 재설정</a></div>
    </section>}
    <button className="account-logout" type="button" onClick={onLogout}><LogOut size={15}/> 로그아웃</button>
  </section>
}
