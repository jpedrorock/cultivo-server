/**
 * Card primitives — refatorado pra ser drop-in sem overrides.
 *
 * Antes: Card vinha com `gap-6 py-6` embutido + Header/Content/Footer com
 * `px-6` agressivo. Resultado: 90% dos consumidores faziam overrides
 * (`py-0`, `px-5`, `pb-3`) toda vez. Card virou só "borda + radius".
 *
 * Agora:
 * - <Card> — só estrutura visual (border + radius + bg + shadow). Zero padding.
 * - <CardHeader> — defaults sensatos pra título + descrição (px-5 pt-5 pb-3).
 * - <CardContent> — alinha com header (px-5 pb-5 pt-0).
 * - <CardFooter> — px-5 py-3 com border-t opcional via `[.border-t]`.
 *
 * Pros:
 * - Drop-in: <Card><CardHeader>... funciona sem overrides na maioria dos casos
 * - Densidade extra: passa className próprio pra ajustar pontual
 * - Padding consistente cross-app: 5 (default) ou 3 (compact via override)
 *
 * Migration: pra cards que tinham `<Card className="py-0">` é redundante agora,
 * mas não quebra. Limpeza opcional dos overrides.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col rounded-[1.25rem] border shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-5 pt-5 pb-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-5 pb-5", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-5 py-3 [.border-t]:pt-3", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
