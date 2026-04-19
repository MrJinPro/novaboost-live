import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function HelpTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground" aria-label="Подсказка">
            <CircleHelp className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 bg-surface-2 px-3 py-2 text-foreground shadow-xl">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}