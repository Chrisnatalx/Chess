export function checkAccess(req: Request): boolean {
  const esperada = process.env.ACCESS_KEY
  // Sin clave configurada el sitio queda cerrado, no abierto.
  // Fallar cerrado evita exponer la API por un despliegue mal configurado.
  if (!esperada) return false
  return req.headers.get('x-access-key') === esperada
}

export function accessDenied(): Response {
  return Response.json({ error: 'forbidden' }, { status: 403 })
}
