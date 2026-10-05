"use client";

import { useMemo } from "react";
import { Dropdown } from "@/components/ui/dropdown";
import { restaurantToOption, type PickerRestaurant } from "@/lib/restaurant-picker";
import { cn } from "@/lib/utils";

export type { PickerRestaurant };

// The admin's restaurant chooser: the shared Dropdown with a photo, an item count and the
// switched-off and sold-out badges on each row.
export function RestaurantPicker({
  restaurants,
  value,
  onChange,
  label,
  className
}: {
  restaurants: PickerRestaurant[];
  value: string | null;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}) {
  const options = useMemo(() => restaurants.map(restaurantToOption), [restaurants]);
  return (
    <Dropdown
      options={options}
      value={value}
      onChange={onChange}
      label={label}
      ariaLabel="Restaurants"
      placeholder="Choose a restaurant"
      searchable
      searchPlaceholder="Search restaurants"
      emptyText="No restaurant matches"
      className={cn("max-w-lg", className)}
    />
  );
}
