import { useState } from "react";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";

interface AdvancedTourGuideProps {
  run: boolean;
  onFinish: () => void;
}

export function AdvancedTourGuide({ run, onFinish }: AdvancedTourGuideProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const steps: Step[] = [
    {
      target: "body",
      content: (
        <div>
          <h2 className="text-xl font-bold mb-2">Tour das Calculadoras Avançadas 🧮</h2>
          <p className="text-sm">
            Vamos explorar as calculadoras que vão otimizar seu cultivo: Rega e Runoff, 
            Lux→PPFD e PPM↔EC. Essas ferramentas ajudam a calcular parâmetros ideais.
          </p>
        </div>
      ),
      placement: "center",
      disableBeacon: true,
    },
    {
      target: '[data-tour="calculator-watering"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Calculadora de Rega e Runoff</h3>
          <p className="text-sm mb-2">
            Esta calculadora tem duas funções: calcular o <strong>volume ideal de rega</strong> baseado 
            no tamanho do vaso e substrato, e medir o <strong>runoff</strong> (água drenada) para 
            evitar acúmulo de sais.
          </p>
          <p className="text-xs text-muted-foreground">
            Runoff ideal: 10-20% do volume regado
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="watering-pot-volume"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Volume do Vaso</h3>
          <p className="text-sm mb-2">
            Insira o tamanho do vaso em litros. A calculadora sugere o volume ideal 
            de rega baseado no tamanho do vaso e tipo de substrato.
          </p>
          <p className="text-xs text-muted-foreground">
            Exemplo: Vaso de 11L em coco = ~2.2L por rega
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="watering-substrate"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Tipo de Substrato</h3>
          <p className="text-sm mb-2">
            Selecione o substrato usado (Solo, Fibra de Coco ou Hidroponia). 
            Cada substrato retém água de forma diferente, afetando o volume ideal.
          </p>
          <p className="text-xs text-muted-foreground">
            Coco drena rápido (20% do vaso), Solo retém mais (15%)
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="runoff-watered"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Volume Regado</h3>
          <p className="text-sm mb-2">
            Na seção de Runoff, insira quanto você regou (em litros). 
            Este é o volume total de solução nutritiva aplicada.
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="runoff-collected"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Runoff Coletado</h3>
          <p className="text-sm mb-2">
            Insira quanto drenou após a rega. A calculadora mostra o percentual 
            e indica se está na faixa ideal (10-20%).
          </p>
          <p className="text-xs text-muted-foreground">
            Runoff baixo (&lt;10%) = risco de sais. Alto (&gt;20%) = desperdício
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="calculator-lux-ppfd"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Conversor Lux → PPFD</h3>
          <p className="text-sm mb-2">
            Converte leituras de luxímetro (lux) para PPFD (µmol/m²/s), 
            a medida usada em cultivo. Essencial para calcular DLI.
          </p>
          <p className="text-xs text-muted-foreground">
            PPFD ideal: Vegetação 400-600, Floração 600-1000 µmol/m²/s
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="lux-input"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Leitura em Lux</h3>
          <p className="text-sm mb-2">
            Insira o valor medido com seu luxímetro ou app de celular. 
            A calculadora converte automaticamente para PPFD usando o fator 0.015.
          </p>
          <p className="text-xs text-muted-foreground">
            Exemplo: 40,000 lux ≈ 600 PPFD (ideal para floração)
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="calculator-ppm-ec"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Conversor PPM ↔ EC</h3>
          <p className="text-sm mb-2">
            Converte entre PPM (partes por milhão) e EC (condutividade elétrica). 
            Útil quando sua receita está em uma unidade e seu medidor usa outra.
          </p>
          <p className="text-xs text-muted-foreground">
            EC ideal: Vegetação 1.0-1.5, Floração 1.5-2.5 mS/cm
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: '[data-tour="ppm-input"]',
      content: (
        <div>
          <h3 className="font-bold mb-1">Valor em PPM</h3>
          <p className="text-sm mb-2">
            Insira o valor em PPM para converter para EC. A conversão usa 
            o fator 500 (padrão americano) ou 700 (padrão europeu).
          </p>
          <p className="text-xs text-muted-foreground">
            1000 PPM (500) = 2.0 EC | 1000 PPM (700) = 1.43 EC
          </p>
        </div>
      ),
      placement: "bottom",
    },
    {
      target: "body",
      content: (
        <div>
          <h2 className="text-xl font-bold mb-2">Tour Concluído! 🎓</h2>
          <p className="text-sm mb-3">
            Agora você domina as calculadoras avançadas! Use-as regularmente para 
            monitorar e otimizar as condições de cultivo.
          </p>
          <p className="text-xs text-muted-foreground">
            <strong>Dica Pro:</strong> Salve suas receitas de rega e fertilização 
            para reutilizar em ciclos futuros.
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
