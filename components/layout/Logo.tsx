import Image from "next/image";

/**
 * logocochera.png es el arte promocional completo (isotipo + "KRD PARK" +
 * "ESTACIONAMIENTO" + tagline en cuatro íconos), pensado para un afiche, no
 * para un logo de barra de navegación. En vez de encogerlo entero (el
 * texto quedaría ilegible a este tamaño) se recorta vía CSS
 * (object-fit: cover + object-position: top) para mostrar solo el isotipo
 * (auto + techo + "P") que ocupa la franja superior de la imagen — sin
 * generar ni deformar ninguna imagen nueva, es el mismo archivo, solo una
 * ventana distinta sobre él. El nombre "KRD PARK" se escribe aparte con la
 * tipografía propia de la plataforma (nítido en cualquier tamaño/tema),
 * usando el mismo azul de marca que ya tiene "PARK" en el arte original.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative shrink-0 overflow-hidden rounded-lg aspect-[1254/690] ${
          compact ? "h-10" : "h-[52px] sm:h-14"
        }`}
      >
        <Image
          src="/logocochera.png"
          alt="KRD Park"
          fill
          sizes="120px"
          className="object-cover object-top"
          priority
        />
      </div>
      {!compact && (
        <span className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          KRD <span className="text-accent">PARK</span>
        </span>
      )}
    </div>
  );
}
