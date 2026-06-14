import { Component, type ErrorInfo, type ReactNode } from 'react'

type RendererErrorBoundaryProps = {
  children: ReactNode
}

type RendererErrorBoundaryState = {
  error: Error | null
}

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[renderer] React tree crashed', error, errorInfo)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <main className="flex h-full min-h-screen items-center justify-center bg-[#f4eddf] p-6 text-[#3e4a32]">
        <section className="w-full max-w-md rounded-2xl border border-[#d8cfbc] bg-white/85 p-6 text-center shadow-lg">
          <h1 className="organic-serif text-2xl font-semibold">页面遇到错误</h1>
          <p className="mt-3 text-sm leading-6 text-[#6f6658]">
            当前页面无法继续运行，刷新应用即可恢复。
          </p>
          <button
            type="button"
            className="mt-5 rounded-lg bg-[#5d6b4d] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4d5a40]"
            onClick={() => window.location.reload()}
          >
            刷新应用
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-black/5 p-3 text-left text-xs text-[#8f3f31]">
              {this.state.error.message}
            </pre>
          )}
        </section>
      </main>
    )
  }
}
