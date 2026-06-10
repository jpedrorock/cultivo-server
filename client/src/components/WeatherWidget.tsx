import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThermometerSun, Droplets, MapPin, Loader2, CloudOff } from "lucide-react";

export function WeatherWidget() {
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [cityName, setCityName] = useState<string>("Sua Localização");

  // Obter geolocalização do usuário
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocation({ lat: latitude, lon: longitude });
          
          // Tentar obter nome da cidade via reverse geocoding
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
            .then(res => res.json())
            .then(data => {
              const city = data.address?.city || data.address?.town || data.address?.village || "Sua Localização";
              setCityName(city);
            })
            .catch(() => setCityName("Sua Localização"));
        },
        (error) => {
          console.error("Geolocation error:", error);
          setLocationError("Não foi possível obter sua localização");
          // Fallback para Brasília
          setLocation({ lat: -15.7939, lon: -47.8828 });
          setCityName("Brasília");
        }
      );
    } else {
      setLocationError("Geolocalização não suportada");
      // Fallback para Brasília
      setLocation({ lat: -15.7939, lon: -47.8828 });
      setCityName("Brasília");
    }
  }, []);

  // Clima muda devagar — busca só ao montar. staleTime longo evita refetch ao
  // navegar entre telas. Sem polling por timer (pedido do João).
  const { data: weather, isLoading, error } = trpc.weather.getCurrent.useQuery(
    { lat: location?.lat ?? 0, lon: location?.lon ?? 0 },
    { enabled: !!location, staleTime: 30 * 60 * 1000 }
  );

  if (isLoading || !location) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ThermometerSun className="w-4 h-4 text-blue-500" />
            Clima Externo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || locationError) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CloudOff className="w-4 h-4 text-muted-foreground" />
            Clima Externo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {locationError || "Erro ao carregar dados do clima"}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ThermometerSun className="w-4 h-4 text-blue-500" />
          Clima Externo
        </CardTitle>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <MapPin className="w-3 h-3" />
          <span>{cityName}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {/* Temperatura */}
          <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
            <ThermometerSun className="w-6 h-6 text-orange-500 mb-1" />
            <div className="text-2xl font-bold text-foreground">
              {weather?.temperature?.toFixed(1)}°C
            </div>
            <div className="text-xs text-muted-foreground mt-1">Temperatura</div>
          </div>

          {/* Umidade */}
          <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
            <Droplets className="w-6 h-6 text-blue-500 mb-1" />
            <div className="text-2xl font-bold text-foreground">
              {weather?.humidity}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">Umidade</div>
          </div>
        </div>

        <div className="mt-2 text-xs text-muted-foreground text-center">
          Atualizado às {new Date(weather?.time || "").toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </CardContent>
    </Card>
  );
}
