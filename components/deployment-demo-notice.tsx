"use client";
import { useStore } from "./store-provider";
export function DeploymentDemoNotice() {
  const { readOnly } = useStore();
  return readOnly ? <aside className="deployment-demo-notice"><div className="container"><strong>নমুনা বইয়ের ডেমো</strong><span>সার্চ, ফিল্টার ও কার্ট পরীক্ষা করতে পারবেন। এই মোডে অ্যাকাউন্ট বা অর্ডার সংরক্ষণ হয় না।</span></div></aside> : null;
}
