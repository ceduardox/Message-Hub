import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginRequest } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { MessageSquare, Loader2, Sparkles } from "lucide-react";

export default function LoginPage() {
  const { login, isLoggingIn } = useAuth();
  
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginRequest) => {
    login(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 space-y-3">
          <div className="relative inline-block">
            <div className="h-20 w-20 rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-2xl border border-white/30">
              <MessageSquare className="h-10 w-10 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 h-6 w-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg animate-pulse">
              <Sparkles className="h-3 w-3 text-yellow-800" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-lg">
            Ryztor Agent IA
          </h1>
          <p className="text-white/80 text-sm">
            Tu asistente de ventas por WhatsApp
          </p>
        </div>

        <div className="bg-white/95 backdrop-blur-lg rounded-3xl shadow-2xl p-8 space-y-6">
          <div className="text-center mb-2">
            <h2 className="text-xl font-semibold text-gray-800">Bienvenido</h2>
            <p className="text-sm text-gray-500">Ingresa tus credenciales para continuar</p>
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium text-sm">Usuario</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Tu usuario" 
                        {...field} 
                        className="h-12 rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-700 font-medium text-sm">Contraseña</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        {...field} 
                        className="h-12 rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                disabled={isLoggingIn}
                className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-500/30 transition-all"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Ingresando...
                  </>
                ) : (
                  "Iniciar Sesión"
                )}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs text-white/60 mt-6">
          Potenciado con Inteligencia Artificial
        </p>
      </div>
    </div>
  );
}
