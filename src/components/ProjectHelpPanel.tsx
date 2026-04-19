import { Lightbulb, Sparkles } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type ProjectHelpItem = {
  key: string;
  title: string;
  body: string;
};

type ProjectHelpPanelProps = {
  badge?: string;
  title: string;
  description: string;
  items: ProjectHelpItem[];
};

export function ProjectHelpPanel({ badge = "Подсказки по проекту", title, description, items }: ProjectHelpPanelProps) {
  return (
    <section className="rounded-3xl border border-border/50 bg-surface/60 p-5 md:p-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/30 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5 text-blast" /> {badge}
      </div>
      <div className="mt-4 flex items-start gap-3">
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-cosmic/15 text-cosmic">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>

      <Accordion type="single" collapsible className="mt-5">
        {items.map((item) => (
          <AccordionItem key={item.key} value={item.key} className="border-border/40">
            <AccordionTrigger className="text-base font-semibold hover:no-underline">{item.title}</AccordionTrigger>
            <AccordionContent className="text-sm leading-6 text-muted-foreground">
              {item.body}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}