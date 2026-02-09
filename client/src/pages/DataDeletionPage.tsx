import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Send } from "lucide-react";

export default function DataDeletionPage() {
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/data-deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), reason: reason.trim() }),
      });
      if (res.ok) {
        setSubmitted(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Eliminación de Datos de Usuario</h1>
        <p className="text-slate-400 mb-8">Última actualización: 9 de febrero de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Tu derecho a la eliminación de datos</h2>
            <p>Respetamos tu derecho a la privacidad. Si deseas que eliminemos los datos personales que hemos recopilado a través de nuestro servicio de WhatsApp, completa el formulario a continuación.</p>
          </section>

          {submitted ? (
            <section className="bg-emerald-500/10 rounded-lg p-6 border border-emerald-500/30 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-2">Solicitud recibida</h3>
              <p className="text-slate-300">Tu solicitud de eliminación de datos ha sido enviada correctamente. Procesaremos tu solicitud en un plazo máximo de 30 días y te contactaremos por WhatsApp para confirmar.</p>
            </section>
          ) : (
            <section className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">Solicitar eliminación de datos</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Número de teléfono (con código de país)</label>
                  <Input
                    type="tel"
                    placeholder="Ej: +52 1234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-emerald-500"
                    data-testid="input-deletion-phone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Motivo de la solicitud (opcional)</label>
                  <Textarea
                    placeholder="Cuéntanos por qué deseas eliminar tus datos..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-emerald-500 resize-none"
                    data-testid="input-deletion-reason"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!phone.trim() || sending}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white border-0"
                  data-testid="button-submit-deletion"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? "Enviando..." : "Enviar solicitud"}
                </Button>
              </form>
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Datos que se eliminan</h2>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Tu historial de conversaciones</li>
              <li>Tu número de teléfono y nombre de perfil</li>
              <li>Archivos multimedia asociados a tus conversaciones</li>
              <li>Datos de pedidos y solicitudes</li>
              <li>Cualquier otra información personal almacenada</li>
            </ul>
          </section>

          <section className="bg-slate-800/50 rounded-lg p-4 border border-emerald-500/20">
            <p className="text-emerald-400 font-medium">Nota importante</p>
            <p className="mt-1">La eliminación de datos es permanente y no se puede deshacer. Los datos serán eliminados dentro de los 30 días siguientes a la recepción de tu solicitud.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
