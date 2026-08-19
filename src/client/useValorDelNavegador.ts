import { useSyncExternalStore } from 'react'

// El valor no cambia por una fuente externa durante la sesión (no hay un
// evento al que reaccionar: es una lectura única del navegador, como
// localStorage o el soporte de WebGL), así que no hay nada a lo que
// suscribirse de verdad. Se devuelve una función de "desuscripción" vacía:
// el callback de useSyncExternalStore nunca se llama después del montaje.
function suscribirNoop(): () => void {
  return () => {}
}

/**
 * Envuelve `useSyncExternalStore` para leer, una sola vez, un valor que solo
 * existe en el navegador (localStorage, soporte de WebGL, etc.) sin mentir
 * durante el renderizado en el servidor ni pelear con
 * `react-hooks/set-state-in-effect`.
 *
 * En el servidor, y también en el primer render del cliente (antes de que
 * termine la hidratación), se usa `valorDelServidor`: los dos renders
 * coinciden por construcción, no por casualidad, así que no hay advertencia
 * de hidratación. Recién después de montar, React vuelve a renderizar una
 * sola vez con el valor real que devuelve `leerValor`.
 *
 * `leerValor` puede ser una función nueva en cada render — no necesita
 * memoizarse — pero el VALOR que devuelve tiene que ser estable entre
 * llamadas mientras dure la sesión. Si devolviera un objeto o array nuevo en
 * cada llamada (en vez de un primitivo como string/boolean/null), esto
 * entraría en un bucle de renders: useSyncExternalStore nunca vería dos
 * snapshots iguales.
 */
export function useValorDelNavegador<T>(leerValor: () => T, valorDelServidor: T): T {
  return useSyncExternalStore(suscribirNoop, leerValor, () => valorDelServidor)
}
