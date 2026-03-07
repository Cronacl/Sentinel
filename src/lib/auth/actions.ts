"use server";

import { redirect } from "next/navigation";

export async function signInWithGoogle() {
  redirect("/");
}

export async function signOut() {
  redirect("/");
}
