'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

import type { UseAsyncSearchReturn } from '@/hooks/use-async-search';

export interface AsyncComboboxProps<T extends Record<string, any>> {
  /** The async search hook instance */
  search: UseAsyncSearchReturn<T>;
  /** Currently selected value (the ID as a string) */
  value: string;
  /** Called when user selects an option */
  onSelect: (id: string) => void;
  /** How to extract the unique ID string from a record */
  getId: (record: T) => string;
  /** How to render the label for each option in the dropdown */
  renderOption: (record: T) => React.ReactNode;
  /** How to render the label of the selected item in the trigger button */
  renderSelected: (record: T) => string;
  /** Placeholder when nothing is selected */
  placeholder?: string;
  /** Placeholder for the search input */
  searchPlaceholder?: string;
  /** Text shown when no results and not loading */
  emptyText?: string;
  /** Optional header element to render at the top of the dropdown list */
  header?: React.ReactNode;
  /** Optional action element to render next to each option (e.g., delete button) */
  renderOptionAction?: (record: T) => React.ReactNode;
  /** Additional className for the trigger button */
  className?: string;
  /** Width of the popover content */
  popoverWidth?: string;
  /** Whether the combobox is disabled */
  disabled?: boolean;
}

export function AsyncCombobox<T extends Record<string, any>>({
  search,
  value,
  onSelect,
  getId,
  renderOption,
  renderSelected,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  header,
  renderOptionAction,
  className,
  popoverWidth = 'w-[400px]',
  disabled = false,
}: AsyncComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find the actual scrollable [data-slot="command-list"] element inside our container
  const getScrollElement = useCallback(() => {
    if (!containerRef.current) return null;
    return containerRef.current.querySelector('[data-slot="command-list"]') as HTMLElement | null;
  }, []);

  // Use scroll event on the actual scrollable element to detect when near bottom
  useEffect(() => {
    if (!open) return;

    // Small delay to let the DOM render
    const timer = setTimeout(() => {
      const scrollEl = getScrollElement();
      if (!scrollEl) return;

      const onScroll = () => {
        if (search.isLoading || !search.hasMore) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollEl;
        if (scrollTop + clientHeight >= scrollHeight - 50) {
          search.loadMore();
        }
      };

      scrollEl.addEventListener('scroll', onScroll);
      // Store cleanup ref
      (containerRef.current as any)?.__scrollCleanup?.();
      if (containerRef.current) {
        (containerRef.current as any).__scrollCleanup = () => scrollEl.removeEventListener('scroll', onScroll);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      (containerRef.current as any)?.__scrollCleanup?.();
    };
  }, [open, search.isLoading, search.hasMore, search.loadMore, getScrollElement, search]);

  // Resolve the selected record from cache
  const selectedRecord = value ? search.getById(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          {selectedRecord ? renderSelected(selectedRecord) : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn(popoverWidth, 'p-0')} align="start">
        <div ref={containerRef}>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={search.searchTerm}
              onValueChange={search.setSearchTerm}
            />
            <CommandList>
              <CommandEmpty>
                {search.isLoading ? 'Loading...' : emptyText}
              </CommandEmpty>
              {header && (
                <div className="px-2 py-1.5" onClick={() => setOpen(false)}>
                  {header}
                </div>
              )}
              <CommandGroup>
                {search.options.map((record) => {
                  const id = getId(record);
                  return (
                    <CommandItem
                      key={id}
                      value={id}
                      onSelect={() => {
                        onSelect(id);
                        setOpen(false);
                      }}
                      className="group flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Check
                          className={cn(
                            'h-4 w-4 shrink-0',
                            value === id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        {renderOption(record)}
                      </div>
                      {renderOptionAction && (
                        <div
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation(); // prevent selecting the item
                          }}
                        >
                          {renderOptionAction(record)}
                        </div>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              {/* Loading spinner at bottom while fetching more */}
              {search.isLoading && search.options.length > 0 && (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* "Scroll for more" hint */}
              {!search.isLoading && search.hasMore && search.options.length > 0 && (
                <div className="text-center text-xs text-muted-foreground py-1.5">
                  ↓ Scroll for more
                </div>
              )}
            </CommandList>
          </Command>
        </div>
      </PopoverContent>
    </Popover>
  );
}
