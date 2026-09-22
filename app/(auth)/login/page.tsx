import type { Metadata } from "next";
import Image from "next/image";
import { Logo } from "@/components/layout/Logo";
import { Clock } from "@/components/layout/Clock";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-primary lg:block">
        <Image
          src="/cocheralogin.png"
          alt="KRD Park"
          fill
          priority
          sizes="50vw"
          className="object-contain"
        />
      </div>

      <div className="flex flex-col justify-between p-6 sm:p-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Clock />
        </div>

        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-2xl font-bold text-foreground">
            Iniciar sesión
          </h2>
          <p className="mt-1 text-sm text-muted">
            Ingresa con tu correo y contraseña asignados.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>

        <p className="text-center text-xs text-muted">
          Acceso restringido al personal autorizado de la cochera.
        </p>
      </div>
    </div>
  );
}
