# Logo de la empresa

Coloca aquí el logo definitivo de la cochera (ej. `logo.svg` o `logo.png`).

Mientras tanto, `components/layout/Logo.tsx` usa un ícono vectorial de
marcador de posición ("P" en un rombo) más el nombre del sistema. Cuando
tengas el logo real:

1. Copia el archivo a esta carpeta, por ejemplo `public/logo/logo.svg`.
2. En `components/layout/Logo.tsx`, reemplaza el SVG de placeholder por
   `<Image src="/logo/logo.svg" alt="Logo" width={..} height={..} />`.
