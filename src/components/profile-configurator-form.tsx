
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { Users, Shield, LockKeyhole, ListChecks, Tag, PlusCircle, XCircle, UserCircle, Copy, Loader2, RefreshCw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { profileConfiguratorSchema, type ProfileConfiguratorValues } from "@/lib/profile-configurator-schema";
import { generateTerraformConfig, type TerraformGenerationOutput } from "@/lib/terraform-generator";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { fetchNewClientId } from "@/services/keycloak-service";


export default function ProfileConfiguratorForm() {
  const { toast } = useToast();
  const [generatedTerraform, setGeneratedTerraform] = React.useState<TerraformGenerationOutput | null>(null);
  const [isFetchingOwnerId, setIsFetchingOwnerId] = React.useState(false);

  const form = useForm<ProfileConfiguratorValues>({
    resolver: zodResolver(profileConfiguratorSchema),
    defaultValues: {
      applicationType: undefined,
      authProfileName: "",
      aclProfileName: "",
      queueName: "",
      ownerId: "",
      topics: [{ value: "" }],
    },
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "topics",
  });

  const applicationType = form.watch("applicationType");

  const handleFetchOwnerId = async () => {
    if (applicationType !== "subscriber") return;

    setIsFetchingOwnerId(true);
    form.setValue("ownerId", "", { shouldValidate: true }); // Clear previous
    setGeneratedTerraform(null);
    try {
      const clientId = await fetchNewClientId();
      form.setValue("ownerId", clientId, { shouldValidate: true });
      toast({
        title: "Owner ID Fetched",
        description: "Owner ID has been populated from Keycloak.",
        duration: 3000,
      });
    } catch (error) {
      let errorMessage = "Failed to fetch Owner ID from Keycloak.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        title: "Error Fetching Owner ID",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });
      form.setValue("ownerId", "Error fetching ID", { shouldValidate: false });
    } finally {
      setIsFetchingOwnerId(false);
    }
  };


  async function handleApplicationTypeChange(value: "publisher" | "subscriber" | undefined) {
    form.setValue("applicationType", value, { shouldValidate: true });
    setGeneratedTerraform(null);

    if (value !== "subscriber") {
      form.setValue("queueName", "", { shouldValidate: true });
      form.setValue("ownerId", "", { shouldValidate: true });
    } else {
      // Optionally clear ownerId when switching to subscriber if it was manually entered for a different type
      // form.setValue("ownerId", "", { shouldValidate: true });
    }
  }


  function onSubmit(values: ProfileConfiguratorValues) {
    console.log("Form values for Terraform generation:", values);
    if (applicationType === "subscriber" && values.ownerId === "Error fetching ID") {
        toast({
            title: "Cannot Generate Terraform",
            description: "Owner ID could not be fetched. Please enter a valid Owner ID or try fetching again.",
            variant: "destructive",
            duration: 5000,
        });
        return;
    }
    try {
      const tfOutput = generateTerraformConfig(values);
      setGeneratedTerraform(tfOutput);
      toast({
        title: "Terraform Code Generated",
        description: "The Terraform configuration has been generated below.",
        duration: 5000,
      });
    } catch (error) {
      console.error("Error generating Terraform:", error);
      let errorMessage = "Failed to generate Terraform configuration.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        title: "Error Generating Terraform",
        description: errorMessage,
        variant: "destructive",
        duration: 5000,
      });
      setGeneratedTerraform(null);
    }
  }

  const handleCopyToClipboard = () => {
    if (generatedTerraform?.fullTerraformConfig) {
      navigator.clipboard.writeText(generatedTerraform.fullTerraformConfig)
        .then(() => {
          toast({ title: "Copied to clipboard!" });
        })
        .catch(err => {
          console.error("Failed to copy text: ", err);
          toast({ title: "Failed to copy", description: "Could not copy text to clipboard.", variant: "destructive" });
        });
    }
  };

  const ownerIdPlaceholder = applicationType === "subscriber" ? "Enter Owner ID or Fetch from Keycloak" : "Enter Owner ID";


  return (
    <>
    <Card className="w-full max-w-2xl shadow-xl">
      <CardHeader>
        <CardTitle className="text-3xl font-headline tracking-tight">Profile Configurator</CardTitle>
        <CardDescription>Fill in the details below to generate Terraform configuration for your application profile.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="applicationType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="flex items-center text-base">
                    <Users className="mr-2 h-5 w-5 text-primary" />
                    Application Type
                  </FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(type) => {
                        handleApplicationTypeChange(type as "publisher" | "subscriber");
                      }}
                      defaultValue={field.value}
                      className="flex flex-col space-y-2 pt-1 sm:flex-row sm:space-y-0 sm:space-x-6"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="publisher" id="publisher"/>
                        </FormControl>
                        <FormLabel htmlFor="publisher" className="font-normal text-sm">
                          Publisher
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="subscriber" id="subscriber"/>
                        </FormControl>
                        <FormLabel htmlFor="subscriber" className="font-normal text-sm">
                          Subscriber
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="authProfileName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-base">
                    <Shield className="mr-2 h-5 w-5 text-primary" />
                    Auth Profile Name
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Enter auth profile name (e.g., My Auth Group)" {...field} onChange={(e) => { field.onChange(e); setGeneratedTerraform(null);}} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="aclProfileName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center text-base">
                    <LockKeyhole className="mr-2 h-5 w-5 text-primary" />
                    ACL Profile Name
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Enter ACL profile name (e.g., My ACL Profile)" {...field} onChange={(e) => { field.onChange(e); setGeneratedTerraform(null);}} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {applicationType === "subscriber" && (
              <>
                <FormField
                  control={form.control}
                  name="queueName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center text-base">
                        <ListChecks className="mr-2 h-5 w-5 text-primary" />
                        Queue Name
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Enter queue name" {...field} onChange={(e) => { field.onChange(e); setGeneratedTerraform(null);}}/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center text-base">
                        <UserCircle className="mr-2 h-5 w-5 text-primary" />
                        Owner ID
                        {isFetchingOwnerId && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                      </FormLabel>
                      <div className="flex items-center space-x-2">
                        <FormControl>
                          <Input 
                            placeholder={ownerIdPlaceholder}
                            {...field} 
                            readOnly={isFetchingOwnerId}
                            onChange={(e) => { field.onChange(e); setGeneratedTerraform(null);}}
                            className={field.value === "Error fetching ID" ? "border-destructive text-destructive" : ""}
                            />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleFetchOwnerId}
                          disabled={isFetchingOwnerId}
                          className="shrink-0"
                        >
                          {isFetchingOwnerId ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          {isFetchingOwnerId ? "Fetching..." : "Fetch ID"}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <Separator />

            <div>
              <FormLabel className="flex items-center text-base mb-3">
                <Tag className="mr-2 h-5 w-5 text-primary" />
                Topics
              </FormLabel>
              {fields.map((item, index) => (
                <FormField
                  key={item.id}
                  control={form.control}
                  name={`topics.${index}.value`}
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 mb-2">
                      <FormControl>
                        <Input placeholder={`Topic ${index + 1} (e.g., data/events/*)`} {...field} onChange={(e) => { field.onChange(e); setGeneratedTerraform(null);}}/>
                      </FormControl>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {remove(index); setGeneratedTerraform(null);}}
                          aria-label="Remove topic"
                          className="text-destructive hover:text-destructive/80"
                        >
                          <XCircle className="h-5 w-5" />
                        </Button>
                      )}
                      <FormMessage className="col-span-2"/>
                    </FormItem>
                  )}
                />
              ))}
               {form.formState.errors.topics && typeof form.formState.errors.topics !== 'object' && !Array.isArray(form.formState.errors.topics) && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.topics.message}</p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {append({ value: "" }); setGeneratedTerraform(null);}}
                className="mt-2 border-dashed hover:border-solid"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Topic
              </Button>
            </div>
            
            <FormMessage>{form.formState.errors.topics?.root?.message}</FormMessage>

          </form>
        </Form>
      </CardContent>
      <CardFooter>
        <Button 
          type="submit" 
          onClick={form.handleSubmit(onSubmit)} 
          className="w-full sm:w-auto bg-accent text-accent-foreground hover:bg-accent/90 focus-visible:ring-ring"
          disabled={form.formState.isSubmitting || isFetchingOwnerId}
        >
          {form.formState.isSubmitting ? "Generating..." : (isFetchingOwnerId ? "Fetching Owner ID..." : "Generate Terraform Code")}
        </Button>
      </CardFooter>
    </Card>

    {generatedTerraform && (
        <Card className="w-full max-w-2xl shadow-xl mt-6">
          <CardHeader>
            <CardTitle className="text-2xl font-headline">Generated Terraform Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              readOnly
              value={generatedTerraform.fullTerraformConfig}
              className="min-h-[200px] font-mono text-sm bg-muted/20"
              aria-label="Generated Terraform Configuration"
            />
          </CardContent>
          <CardFooter>
            <Button onClick={handleCopyToClipboard} variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              Copy Configuration
            </Button>
          </CardFooter>
        </Card>
      )}
    <Toaster />
    </>
  );
}
