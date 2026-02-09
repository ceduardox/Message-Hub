export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Política de Privacidad</h1>
        <p className="text-slate-400 mb-8">Última actualización: 9 de febrero de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Información que recopilamos</h2>
            <p>Cuando interactúas con nuestro servicio a través de WhatsApp, podemos recopilar la siguiente información:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Número de teléfono de WhatsApp</li>
              <li>Nombre de perfil de WhatsApp</li>
              <li>Mensajes enviados y recibidos a través de la plataforma</li>
              <li>Archivos multimedia compartidos (imágenes, audio, documentos)</li>
              <li>Datos de ubicación cuando se comparten voluntariamente</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Cómo usamos la información</h2>
            <p>Utilizamos la información recopilada para:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Responder a tus consultas y mensajes</li>
              <li>Procesar pedidos y solicitudes</li>
              <li>Mejorar nuestro servicio de atención al cliente</li>
              <li>Enviar notificaciones relevantes sobre tus pedidos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Almacenamiento y seguridad</h2>
            <p>Los datos se almacenan en servidores seguros con encriptación. Implementamos medidas de seguridad técnicas y organizativas para proteger tu información personal contra acceso no autorizado, pérdida o alteración.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Compartición de datos</h2>
            <p>No vendemos, comercializamos ni transferimos tu información personal a terceros. Los datos pueden ser compartidos únicamente con:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Meta Platforms (WhatsApp Business API) para el funcionamiento del servicio de mensajería</li>
              <li>OpenAI para el procesamiento de respuestas automatizadas por inteligencia artificial</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Tus derechos</h2>
            <p>Tienes derecho a:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Solicitar acceso a tus datos personales</li>
              <li>Solicitar la corrección de datos inexactos</li>
              <li>Solicitar la eliminación de tus datos</li>
              <li>Retirar tu consentimiento en cualquier momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Retención de datos</h2>
            <p>Conservamos los datos de las conversaciones mientras sean necesarios para el propósito del servicio. Puedes solicitar la eliminación de tus datos en cualquier momento a través de nuestro proceso de eliminación de datos.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Contacto</h2>
            <p>Para cualquier consulta sobre esta política de privacidad o sobre tus datos personales, puedes contactarnos a través de WhatsApp o visitar nuestra página de <a href="/data-deletion" className="text-emerald-400 underline">eliminación de datos</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
