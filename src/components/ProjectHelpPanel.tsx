import { Lightbulb, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type ProjectHelpItem = {
  key: string;
  title: string;
  body: string;
};

type ProjectHelpPanelProps = {
  id?: string;
  badge?: string;
  title: string;
  description: string;
  items: ProjectHelpItem[];
};

export function ProjectHelpPanel({ id = "how-it-works", badge = "Подсказки по проекту", title, description, items }: ProjectHelpPanelProps) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl border border-border/50 bg-surface/50 p-4 md:p-5">
      <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/30 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5 text-blast" /> {badge}
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-cosmic/15 text-cosmic">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold md:text-2xl">{title}</h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>

      <Accordion type="single" collapsible className="mt-4">
        {items.map((item) => (
          <AccordionItem key={item.key} value={item.key} className="border-border/40">
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline md:text-[15px]">{item.title}</AccordionTrigger>
            <AccordionContent className="text-sm leading-6 text-muted-foreground">
              {item.body}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}