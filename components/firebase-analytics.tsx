"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/firebase";

export default function FirebaseAnalytics() {
  useEffect(() => {
    void initAnalytics();
  }, []);

  return null;
}
