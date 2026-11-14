"use client";

import { Component, type ReactNode } from "react";

/** If a child throws while rendering (e.g. WebGL trouble on an old GPU), show `fallback` instead of a blank page. */
export class SafeBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D view disabled after an error; showing the 2D map instead.", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
