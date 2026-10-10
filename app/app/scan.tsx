import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { codeFromScan } from "../lib/invite";
import { colors, space, type } from "../lib/theme";

// Scan the QR code on the host's phone or the TV, in the app. On the web the
// phone's own camera app opens the join link instead.
export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [notOurs, setNotOurs] = useState(false);
  const done = useRef(false);

  const back = (
    <Button
      label="Type the code instead"
      variant="secondary"
      onPress={() => router.back()}
    />
  );

  if (!permission) return <Screen>{null}</Screen>;

  if (!permission.granted) {
    return (
      <Screen footer={back}>
        <View style={styles.intro}>
          <Text style={styles.title}>Scan to join</Text>
          <Text style={styles.body}>
            {permission.canAskAgain
              ? "Point your camera at the code on the host’s phone or the TV."
              : "Camera access is off for Whose Name?. Turn it on in Settings to scan, or type the code."}
          </Text>
        </View>
        {permission.canAskAgain ? (
          <Button label="Use the camera" onPress={requestPermission} />
        ) : (
          <Button
            label="Open Settings"
            onPress={() => void Linking.openSettings()}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen footer={back}>
      <View style={styles.intro}>
        <Text style={styles.title}>Scan to join</Text>
        <Text style={styles.body}>
          Point your camera at the code on the host’s phone or the TV.
        </Text>
      </View>
      {notOurs ? (
        <Banner message="That code isn’t a Whose Name? game." />
      ) : null}
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (done.current) return;
            const code = codeFromScan(data);
            if (!code) return setNotOurs(true);
            done.current = true;
            router.replace(`/j/${code}`);
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.md, paddingTop: space.xxl },
  title: { ...type.title, color: colors.paper },
  body: { ...type.body, color: colors.dusk },
  frame: {
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.paper,
    backgroundColor: colors.tableRaised,
  },
});
