"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/actions/auth-actions";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Correo electrónico" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="usuario@cochera.com"
          required
        />
      </Field>

      <Field label="Contraseña" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      {state.error && (
        <div className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {state.error}
        </div>
      )}

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
