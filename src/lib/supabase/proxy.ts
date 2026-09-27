import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { supabaseEnv } from "./env";

const PUBLIC_PATHS = ["/login", "/auth"];

// Refreshes the Supabase session cookie on every request and sends signed-out
// users to /login. This is an optimistic check only — pages re-check the user
// and RLS enforces data access.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // API routes are never redirected to /login: some are called by external services with no
  // browser session at all (e.g. /api/deliveries/callback, authenticated via a shared secret
  // header, not a cookie) — an HTML redirect there would silently break every such caller.
  // Routes that do need a signed-in user (e.g. /api/notices) check the session themselves and
  // return a proper 401 JSON response; the cookie refresh above still runs for them either way.
  const isApi = pathname.startsWith("/api/");

  if (!signedIn && !isPublic && !isApi) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (signedIn && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/dashboard";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}
