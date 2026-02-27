import { useState, useEffect } from "react";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";

interface TourGuideProps {
  run: boolean;
  onFinish: () => void;
}

export function TourGuide({ run, onFinish }: TourGuideProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const steps: Step[] = [
    {
      target: "body",
      content: (
        <div>
          <h2 className="text-xl font-bold mb-2">Bem-vindo ao App Cultivo! 🌱</h2>
          <p className="text-sm">
            Vamos fazer um tour rápido pelas principais funcionalidades do app.
            Você aprenderá a gerenciar suas estufas, plantas e registros de forma eficiente.
          </p>
        </div>
      ),
      placement: "center",
      disableBeacon: true,
    },
    {
      target: '[data-tour="create-tent-button"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">1. Criar Nova Estufa</h3>
          <p className="text-sm">
            Comece criando uma estufa. Defina nome, fase do ciclo (Vegetação, Floração, etc.) 
            e outras configurações iniciais.
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="tent-card"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">2. Card da Estufa</h3>
          <p className="text-sm">
            Cada estufa tem um card com informações principais: fase, semana, 
            número de plantas e parâmetros ambientais recentes. Clique para ver detalhes.
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="add-plant-button"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">3. Adicionar Plantas</h3>
          <p className="text-sm">
            Dentro de uma estufa, adicione plantas individuais. Defina strain, 
            data de germinação e outras informações importantes.
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="quick-log-menu"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">4. Registro Rápido (Quick Log)</h3>
          <p className="text-sm">
            Use o Quick Log para registrar saúde das plantas de forma rápida. 
            Navegue horizontalmente entre plantas, tire fotos e adicione observações.
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="history-menu"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">5. Histórico e Gráficos</h3>
          <p className="text-sm">
            Visualize o histórico de registros com gráficos animados de temperatura, 
            umidade, pH, EC e PPFD. Analise a evolução dos parâmetros ao longo do tempo.
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="calculators-menu"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">6. Calculadoras</h3>
          <p className="text-sm">
            Acesse calculadoras de DLI (Daily Light Integral), VPD (Vapor Pressure Deficit) 
            e Runoff para otimizar o cultivo.
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="plant-detail-tabs"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">7. Detalhes da Planta</h3>
          <p className="text-sm">
            Na página de detalhes, acesse abas de Saúde, Tricomas e LST. 
            Registre fotos, observe a evolução e finalize o harvest quando pronto.
          </p>
        </div>
      ),
      placement: "top",
    },
    {
      target: "body",
      content: (
        <div>
          <h2 className="text-xl font-bold mb-2">Tour Concluído! 🎉</h2>
          <p className="text-sm mb-3">
            Agora você conhece as principais funcionalidades do App Cultivo. 
            Explore à vontade e cultive com eficiência!
          </p>
          <p className="text-xs text-muted-foreground">
            Dica: Você pode reiniciar este tour a qualquer momento clicando no botão "?" no header.
          </p>
        </div>
      ),
      placement: "center",
    },
  ];

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, index, action } = data;

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
      onFinish();
    }

    // Update step index for controlled progression
    if (action === "next") {
      setStepIndex(index + 1);
    } else if (action === "prev") {
      setStepIndex(index - 1);
    }
  };

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      showProgress
      showSkipButton
      stepIndex={stepIndex}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: "hsl(var(--primary))",
          textColor: "hsl(var(--foreground))",
          backgroundColor: "hsl(var(--card))",
          arrowColor: "hsl(var(--card))",
          overlayColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: "12px",
          padding: "20px",
        },
        tooltipContent: {
          padding: "0",
        },
        buttonNext: {
          backgroundColor: "hsl(var(--primary))",
          borderRadius: "8px",
          padding: "8px 16px",
          fontSize: "14px",
        },
        buttonBack: {
          color: "hsl(var(--muted-foreground))",
          marginRight: "8px",
        },
        buttonSkip: {
          color: "hsl(var(--muted-foreground))",
        },
      }}
      locale={{
        back: "Voltar",
        close: "Fechar",
        last: "Finalizar",
        next: "Próximo",
        open: "Abrir",
        skip: "Pular Tour",
      }}
    />
  );
}
