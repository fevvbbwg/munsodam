import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

type AppErrorBoundaryProps = { children: ReactNode }
type AppErrorBoundaryState = { failed: boolean }

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('문서담 화면을 표시하지 못했습니다.', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-shell app-error-screen">
          <span className="brand-name">문서담 <small>사내 자료실</small></span>
          <section aria-labelledby="app-error-title">
            <span className="section-overline">화면 오류</span>
            <h1 id="app-error-title">화면을 불러오지 못했어요.</h1>
            <p role="alert" aria-live="assertive">페이지를 새로고침하면 다시 열 수 있습니다. 저장된 문서는 그대로 보관됩니다.</p>
            <button className="button-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={15} /> 새로고침
            </button>
          </section>
        </main>
      )
    }
    return this.props.children
  }
}
