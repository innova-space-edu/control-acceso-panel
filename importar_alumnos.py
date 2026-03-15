"""
importar_alumnos.py — v5
Soporta .xlsx, .xls, y .xls HTML desde SIGE (con filas extras al inicio).
"""

import os, glob
from pathlib import Path

SUPABASE_URL  = "https://iiuglkpkkfrjazewuknt.supabase.co"
SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpdWdsa3Bra2ZyamF6ZXd1a250Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NTU5MTUsImV4cCI6MjA4OTAzMTkxNX0.-WHsrggjEgcERSxhjG1qvIqLB5ixWVYs40ltAn1ruT4"
CARPETA_EXCEL = r"C:\alumnos"

CURSOS = {
    "1BA":"1° Básico A",  "1BB":"1° Básico B",
    "2BA":"2° Básico A",  "2BB":"2° Básico B",
    "3BA":"3° Básico A",  "3BB":"3° Básico B",
    "4BA":"4° Básico A",  "4BB":"4° Básico B",
    "5BA":"5° Básico A",  "5BB":"5° Básico B",
    "6BA":"6° Básico A",  "6BB":"6° Básico B",
    "7BA":"7° Básico A",  "7BB":"7° Básico B",
    "8BA":"8° Básico A",  "8BB":"8° Básico B",
    "1MA":"1° Medio A",   "1MB":"1° Medio B",
    "2MA":"2° Medio A",   "2MB":"2° Medio B",
    "3MA":"3° Medio A",   "3MB":"3° Medio B",
    "4MA":"4° Medio A",   "4MB":"4° Medio B",
}

CLAVES_RUT    = ["rut", "run", "rún", "r.u.n", "r.u.t"]
CLAVES_NOMBRE = ["apellido", "nombre", "alumno", "estudiante"]


def limpiar_rut(rut_raw) -> str:
    if not rut_raw:
        return ""
    rut = str(rut_raw).strip().upper()
    if rut.endswith(".0"):
        rut = rut[:-2]
    limpio = rut.replace(".", "").replace(" ", "")
    if "-" not in limpio:
        if len(limpio) >= 2:
            limpio = limpio[:-1] + "-" + limpio[-1]
        else:
            return ""
    partes = limpio.split("-")
    if len(partes) != 2:
        return ""
    cuerpo, dv = partes
    if not cuerpo.isdigit() or len(cuerpo) < 6:
        return ""
    return f"{int(cuerpo):,}".replace(",", ".") + "-" + dv.upper()


def verificar_dv(rut: str) -> bool:
    try:
        limpio = rut.replace(".", "")
        cuerpo_str, dv = limpio.split("-")
        cuerpo = int(cuerpo_str)
        suma, mul = 0, 2
        n = cuerpo
        while n:
            suma += (n % 10) * mul
            n //= 10
            mul = mul + 1 if mul < 7 else 2
        r = 11 - (suma % 11)
        esperado = "0" if r == 11 else "K" if r == 10 else str(r)
        return dv.upper() == esperado
    except Exception:
        return False


def parsear_nombre(texto) -> str:
    if not texto:
        return ""
    texto = str(texto).strip()
    if "," in texto:
        partes   = texto.split(",", 1)
        completo = f"{partes[0].strip()} {partes[1].strip()}"
    else:
        completo = texto
    return completo.title()


def codigo_a_curso(codigo: str) -> str:
    return CURSOS.get(codigo.strip().upper(), codigo.strip().upper())


def encontrar_fila_encabezado(filas: list) -> int:
    """
    Busca la fila que contiene 'RUT' o 'RUN' como encabezado real.
    El SIGE incluye filas de metadata antes de los datos.
    Retorna el índice de la fila de encabezados.
    """
    for i, fila in enumerate(filas):
        celdas = [str(c).strip().lower() for c in fila if c]
        for celda in celdas:
            if any(clave in celda for clave in CLAVES_RUT):
                return i
    return 0  # fallback: primera fila


def detectar_columnas(headers: list) -> tuple:
    """Detecta índices de columna RUT y Nombre."""
    col_rut, col_nombre = None, None
    for i, h in enumerate(headers):
        h_norm = str(h).strip().lower()
        if col_rut    is None and any(c in h_norm for c in CLAVES_RUT):
            col_rut = i
        if col_nombre is None and any(c in h_norm for c in CLAVES_NOMBRE):
            col_nombre = i
    if col_rut    is None: col_rut    = 0
    if col_nombre is None: col_nombre = 1
    return col_rut, col_nombre


def procesar_filas(filas, col_rut, col_nombre, nombre_curso) -> tuple:
    alumnos, skipped = [], 0
    for row_idx, row in enumerate(filas, start=2):
        row = [str(c).strip() if c is not None else "" for c in row]
        if not any(row):
            continue
        rut_raw = row[col_rut] if col_rut < len(row) else ""
        if not rut_raw:
            skipped += 1
            continue
        rut = limpiar_rut(rut_raw)
        if not rut:
            skipped += 1
            continue
        if not verificar_dv(rut):
            print(f"    [⚠] Fila {row_idx}: dígito verificador incorrecto en {rut}")
        nombre_raw = row[col_nombre] if col_nombre < len(row) else ""
        nombre = parsear_nombre(nombre_raw)
        if not nombre:
            print(f"    [⚠] Fila {row_idx}: sin nombre para {rut} — omitido")
            skipped += 1
            continue
        alumnos.append({"rut": rut, "nombre": nombre, "curso": nombre_curso, "activo": True})
    return alumnos, skipped


def es_html(ruta: str) -> bool:
    try:
        with open(ruta, "rb") as f:
            inicio = f.read(300).lower()
        return b"<!doctype" in inicio or b"<html" in inicio or b"<table" in inicio
    except Exception:
        return False


def leer_html_sige(ruta: str, nombre_curso: str) -> tuple:
    """Lee .xls que es HTML del SIGE — detecta la fila correcta de encabezados."""
    from bs4 import BeautifulSoup

    with open(ruta, "rb") as f:
        contenido = f.read()
    try:
        texto = contenido.decode("utf-8")
    except UnicodeDecodeError:
        texto = contenido.decode("latin-1")

    soup  = BeautifulSoup(texto, "lxml")
    tabla = soup.find("table")
    if not tabla:
        raise ValueError("No se encontró tabla en el archivo HTML")

    # Extraer todas las filas como listas de texto
    todas_filas = []
    for tr in tabla.find_all("tr"):
        celdas = [td.get_text(strip=True) for td in tr.find_all(["th", "td"])]
        if celdas:
            todas_filas.append(celdas)

    if not todas_filas:
        raise ValueError("La tabla está vacía")

    # Encontrar la fila real de encabezados (puede no ser la primera)
    idx_header = encontrar_fila_encabezado(todas_filas)
    headers    = todas_filas[idx_header]
    filas_data = todas_filas[idx_header + 1:]

    col_rut, col_nombre = detectar_columnas(headers)
    print(f"    [INFO] Encabezados en fila {idx_header+1}: {headers[:4]}")
    print(f"    [INFO] Col RUT={col_rut} ('{headers[col_rut]}')  Col Nombre={col_nombre} ('{headers[col_nombre]}')")

    return procesar_filas(filas_data, col_rut, col_nombre, nombre_curso)


def leer_excel(ruta: str) -> tuple:
    extension    = Path(ruta).suffix.lower()
    nombre_curso = codigo_a_curso(Path(ruta).stem)

    if extension == ".xls" and es_html(ruta):
        print(f"    [INFO] Formato HTML/SIGE detectado")
        return leer_html_sige(ruta, nombre_curso)

    if extension == ".xls":
        import xlrd
        wb  = xlrd.open_workbook(ruta)
        ws  = wb.sheet_by_index(0)
        todas = [[ws.cell_value(r, c) for c in range(ws.ncols)] for r in range(ws.nrows)]
        idx   = encontrar_fila_encabezado(todas)
        col_rut, col_nombre = detectar_columnas(todas[idx])
        return procesar_filas(todas[idx+1:], col_rut, col_nombre, nombre_curso)

    else:
        import openpyxl
        wb  = openpyxl.load_workbook(ruta, data_only=True)
        ws  = wb.active
        todas = [list(row) for row in ws.iter_rows(values_only=True)]
        idx   = encontrar_fila_encabezado(todas)
        col_rut, col_nombre = detectar_columnas([str(h) if h else "" for h in todas[idx]])
        return procesar_filas(todas[idx+1:], col_rut, col_nombre, nombre_curso)


def importar_a_supabase(alumnos: list, sb) -> tuple:
    LOTE = 50
    ok, errores = 0, 0
    for i in range(0, len(alumnos), LOTE):
        lote = alumnos[i:i+LOTE]
        try:
            sb.table("estudiantes").upsert(lote).execute()
            ok += len(lote)
            print(f"  ✓ {ok}/{len(alumnos)} subidos...", end="\r")
        except Exception as e:
            print(f"\n  [ERROR] Lote {i//LOTE+1}: {e}")
            errores += len(lote)
    return ok, errores


def main():
    print()
    print("=" * 54)
    print("  IMPORTADOR DE ALUMNOS → SUPABASE  v5")
    print("  Soporta .xlsx · .xls · SIGE/HTML")
    print("=" * 54)
    print()

    if not os.path.exists(CARPETA_EXCEL):
        print(f"[ERROR] Carpeta no encontrada: {CARPETA_EXCEL}")
        input("\nPresiona Enter para salir...")
        return

    archivos = sorted(
        glob.glob(os.path.join(CARPETA_EXCEL, "*.xlsx")) +
        glob.glob(os.path.join(CARPETA_EXCEL, "*.xls"))
    )
    if not archivos:
        print(f"[ERROR] No hay archivos en {CARPETA_EXCEL}")
        input("\nPresiona Enter para salir...")
        return

    print(f"  Carpeta : {CARPETA_EXCEL}")
    print(f"  Archivos: {len(archivos)} encontrados")
    print()
    for a in archivos:
        ext  = Path(a).suffix.upper()[1:]
        cod  = Path(a).stem.strip().upper()
        print(f"    {cod:6} ({ext})  →  {codigo_a_curso(cod)}")
    print()

    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("  [OK] Conectado a Supabase\n")
    except Exception as e:
        print(f"  [ERROR] {e}")
        input("\nPresiona Enter para salir...")
        return

    todos, vistos, total_skip = [], set(), 0

    for archivo in archivos:
        cod   = Path(archivo).stem.strip().upper()
        curso = codigo_a_curso(cod)
        print(f"  📄 {Path(archivo).name}  →  {curso}")
        try:
            alumnos, skipped = leer_excel(archivo)
            total_skip += skipped
            nuevos = 0
            for a in alumnos:
                if a["rut"] in vistos:
                    print(f"    [DUP] {a['rut']} ({a['nombre']})")
                else:
                    vistos.add(a["rut"])
                    todos.append(a)
                    nuevos += 1
            print(f"    → {nuevos} alumnos listos")
        except Exception as e:
            print(f"    [ERROR] {e}")

    print()
    print(f"  Total a importar : {len(todos)} alumnos")
    if total_skip:
        print(f"  Filas omitidas   : {total_skip}")
    print()

    if not todos:
        print("  No hay alumnos para importar.")
        input("Presiona Enter para salir...")
        return

    print("  Vista previa (primeros 5):")
    print(f"  {'RUT':<16} {'Nombre':<38} Curso")
    print(f"  {'-'*16} {'-'*38} {'-'*15}")
    for a in todos[:5]:
        print(f"  {a['rut']:<16} {a['nombre']:<38} {a['curso']}")
    print()

    resp = input("  ¿Importar a Supabase ahora? (S/N): ").strip().upper()
    if resp != "S":
        print("\n  Cancelado.")
        input("Presiona Enter para salir...")
        return

    print()
    ok, errores = importar_a_supabase(todos, sb)

    print()
    print("=" * 54)
    print(f"  LISTO — {ok} alumnos importados")
    if errores:
        print(f"  Errores: {errores}")
    print("=" * 54)
    print()
    input("Presiona Enter para salir...")


if __name__ == "__main__":
    main()
