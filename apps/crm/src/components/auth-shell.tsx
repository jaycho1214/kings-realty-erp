import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Split-screen shell for the auth pages (sign-in / sign-up / pending), adapted
 * from the shadcn `signup-04` block: form on the left, storefront photo on the
 * right (hidden below md). The form content is passed as children.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="flex flex-col justify-center p-6 md:p-8">
              {children}
            </div>
            <div className="relative hidden bg-muted md:block">
              <Image
                src="/storefront.jpg"
                alt="King's Realty 사무실"
                fill
                sizes="(min-width: 768px) 50vw, 0px"
                className="object-cover object-center"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                <p className="text-base font-semibold tracking-tight">
                  King&apos;s Realty
                </p>
                <p className="text-xs text-white/80">USFK Approved Housing</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
