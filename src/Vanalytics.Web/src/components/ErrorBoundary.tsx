import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-6 text-center">
        <img
          src="/vanalytics-square-logo.png"
          alt="Vanalytics"
          className="w-48 h-48 mb-10 drop-shadow-[0_0_40px_rgba(99,102,241,0.3)]"
        />
        <h1 className="text-2xl font-semibold text-gray-100 mb-3">
          Something went wrong
        </h1>
        <p className="text-gray-400 max-w-md mb-8">
          An unexpected error occurred. Try refreshing the page — if the problem
          persists, it may be a temporary issue on our end.
        </p>
        <button
          onClick={() => window.location.assign('/')}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          Return Home
        </button>
      </div>
    )
  }
}
