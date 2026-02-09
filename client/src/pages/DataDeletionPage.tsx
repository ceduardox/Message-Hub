export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Eliminación de Datos de Usuario</h1>
        <p className="text-slate-400 mb-8">Última actualización: 9 de febrero de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Instrucciones para solicitar la eliminación de tus datos</h2>
            <p>Respetamos tu derecho a la privacidad. Si deseas que eliminemos los datos personales que hemos recopilado a través de nuestro servicio de WhatsApp, puedes solicitarlo siguiendo estos pasos:</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Proceso de eliminación</h2>
            <ol className="list-decimal ml-6 space-y-3">
              <li>
                <strong className="text-white">Envía un mensaje por WhatsApp</strong>
                <p className="mt-1">Escribe la palabra "ELIMINAR DATOS" al mismo número de WhatsApp con el que has interactuado con nuestro servicio.</p>
              </li>
              <li>
                <strong className="text-white">Confirmación</strong>
                <p className="mt-1">Recibirás un mensaje de confirmación solicitando que verifiques tu solicitud.</p>
              </li>
              <li>
                <strong className="text-white">Procesamiento</strong>
                <p className="mt-1">Una vez confirmada tu solicitud, procederemos a eliminar todos tus datos en un plazo máximo de 30 días.</p>
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Datos que se eliminan</h2>
            <p>Al procesar tu solicitud, eliminaremos:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Tu historial de conversaciones</li>
              <li>Tu número de teléfono y nombre de perfil</li>
              <li>Archivos multimedia asociados a tus conversaciones</li>
              <li>Datos de pedidos y solicitudes</li>
              <li>Cualquier otra información personal almacenada</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Plazo de eliminación</h2>
            <p>Los datos serán eliminados dentro de los 30 días siguientes a la confirmación de tu solicitud. Recibirás una notificación una vez que el proceso se haya completado.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Datos que podemos retener</h2>
            <p>En algunos casos, podemos retener cierta información si es necesario para cumplir con obligaciones legales, resolver disputas o hacer cumplir nuestros acuerdos. En tales casos, los datos retenidos estarán protegidos y solo se utilizarán para dichos fines específicos.</p>
          </section>

          <section className="bg-slate-800/50 rounded-lg p-4 border border-emerald-500/20">
            <p className="text-emerald-400 font-medium">Nota importante</p>
            <p className="mt-1">La eliminación de datos es permanente y no se puede deshacer. Asegúrate de que deseas eliminar toda tu información antes de confirmar la solicitud.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
