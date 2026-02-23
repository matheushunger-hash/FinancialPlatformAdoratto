"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { signIn } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

// useActionState is a React 19 hook that wraps a Server Action.
// It gives us:
//   - state: the last return value from the action (our error message, if any)
//   - formAction: a function to pass to <form action={...}>
//   - pending: a boolean that's true while the action is running
//
// This pattern gives us progressive enhancement for free —
// the form even works if JavaScript fails to load in the browser.

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, { error: undefined });

  return (
    <Card>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4 pt-6">
          {state?.error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="voce@adoratto.com.br"
              autoComplete="email"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        </CardContent>

        <CardFooter className="pt-2">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrar
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
