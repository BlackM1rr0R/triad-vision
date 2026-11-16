import { WorkScenePage } from '@/components/workScenes/WorkScenePage';
import { RestaurantKitchenArt } from '@/components/workScenes/illustrations/RestaurantKitchen';
import { RESTAURANT_KITCHEN } from '@/lib/workScenes/scenes/restaurantKitchen';

/** Route module of one work scene (own chunk with its texts); page: components/workScenes/WorkScenePage. */
export default function RestaurantKitchenScene() {
  return <WorkScenePage scene={RESTAURANT_KITCHEN} art={<RestaurantKitchenArt />} />;
}
