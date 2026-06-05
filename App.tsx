import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import CarteleraScreen from "./src/screens/CarteleraScreen";
import CafesScreen from "./src/screens/CafesScreen";
import PerfilScreen from "./src/screens/PerfilScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === "Cartelera") iconName = "musical-notes";
            else if (route.name === "Cafés") iconName = "cafe";
            else iconName = "person";
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: "#8B4513",
          tabBarInactiveTintColor: "#A0897A",
          headerStyle: { backgroundColor: "#3D2B1F" },
          headerTintColor: "#FAF0E6",
        })}
      >
        <Tab.Screen name="Cartelera" component={CarteleraScreen} />
        <Tab.Screen name="Cafés" component={CafesScreen} />
        <Tab.Screen name="Perfil" component={PerfilScreen} />
      </Tab.Navigator>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}
