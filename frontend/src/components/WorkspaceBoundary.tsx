import { Component } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export default class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="site-container page-loading"><h1>Chưa tải được ứng dụng</h1>
      <div className="guide-content"><p className="text-muted leading-8">Kết nối có thể đã bị ngắt hoặc phiên bản web vừa được cập nhật. Hãy kiểm tra backend đang chạy và tải lại trang.</p><button type="button" className="button button-primary" onClick={() => window.location.reload()}><Icon name="refresh" size={19} />Tải lại trang</button></div>
    </main>
  }
}
